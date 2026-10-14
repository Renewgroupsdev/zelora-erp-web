import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { BranchRecord, BranchStatus } from '../models/branch-franchise.model';
import { Employee } from '../models/hr.model';
import { ApiRoutesConstants } from './api-route-constants';
import { BranchOptionsService } from './branch-options.service';
import { HrService } from './hr.service';

/** The four stat cards on the list page (GET /branches -> stats). */
export interface BranchOverview {
  totalBranches: number;
  newBranches: number;
  activeBranches: number;
  activePercent: number;
  totalEmployees: number;
  newEmployees: number;
  monthlySales: number;
  previousMonthSales: number;
  salesGrowthPercent: number | null;
}

export interface BranchActivity {
  icon: string;
  tone: 'blue' | 'green' | 'red' | 'orange' | 'purple';
  title: string;
  detail: string;
  when: string;
}

export interface LabelValue { label: string; value: number; }

export interface SeriesPoint { key: string; label: string; sales: number; bills: number; appointments: number; }

/** GET /branches/{id} -> summary: what the details header and overview tab show. */
export interface BranchSummary {
  employees: number;
  customers: number;
  monthlySales: number;
  todaySales: number;
  totalCollected: number;
  receivables: number;
  inventoryValue: number;
  appointments: number;
  leadRate: number;
  employeesByDesignation: { designation: string; count: number }[];
  revenueByTreatment: LabelValue[];
  funnel: LabelValue[];
  monthlySeries: SeriesPoint[];
  activities: BranchActivity[];
}

export interface BranchFilterQuery {
  search?: string;
  status?: string | null;
  cities?: string[];
}

/** Server error -> the first validation message (or the API message / a fallback). */
export function apiError(err: any, fallback = 'Something went wrong. Please try again.'): string {
  const errors = err?.error?.errors;
  const first = errors && typeof errors === 'object' ? (Object.values(errors)[0] as string[] | string | undefined) : null;
  return (Array.isArray(first) ? first[0] : first) || err?.error?.message || fallback;
}

/**
 * Branch Management, backed by the API (GET/POST/PUT/DELETE /branches). The list is loaded once into signals;
 * the details page and its tabs ask the API for their own data (nothing is stored in the browser).
 */
@Injectable({ providedIn: 'root' })
export class BranchService {
  private readonly api = inject(ApiDataService);
  private readonly hr = inject(HrService);
  private readonly branchOptions = inject(BranchOptionsService);

  private readonly list = signal<BranchRecord[]>([]);
  private readonly overview = signal<BranchOverview | null>(null);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly branches = computed(() => this.list());
  readonly stats = computed(() => this.overview());

  branch(id: string): BranchRecord | undefined {
    return this.list().find(b => b.id === id);
  }

  /** Every branch (the list is small, so the screens filter / sort / page it in the browser) plus the stat cards. */
  load(): Observable<BranchRecord[]> {
    this.loading.set(true);
    return (this.api.GET(`${ApiRoutesConstants.BRANCHES}?per_page=200&sort_by=code&sort_direction=asc`) as Observable<any>).pipe(
      tap({ error: () => this.loading.set(false) }),
      map(res => {
        this.overview.set(res.stats ? overviewFromApi(res.stats) : null);
        const rows = ((res.data ?? []) as any[]).map(branchFromApi);
        this.list.set(rows);
        this.loaded.set(true);
        this.loading.set(false);
        return rows;
      }),
    );
  }

  /** One branch with its summary (also refreshes the copy in the list). */
  fetch(id: string): Observable<{ branch: BranchRecord; summary: BranchSummary }> {
    return (this.api.GET(`${ApiRoutesConstants.BRANCHES}/${id}`) as Observable<any>).pipe(
      map(res => {
        const branch = branchFromApi(res.data);
        this.upsert(branch);
        return { branch, summary: summaryFromApi(res.data.summary ?? {}) };
      }),
    );
  }

  /** Creates (id = null) or updates a branch. Emits the saved record; errors carry the API message. */
  save(id: string | null, input: Omit<BranchRecord, 'id' | 'code'>): Observable<BranchRecord> {
    const body = {
      name: input.name, city: input.city, state: input.state || null, phone: input.phone, email: input.email || null,
      address: input.address || null, status: input.status, opened_on: input.openedOn || null, photo: input.photo || null,
      latitude: input.latitude ?? null, longitude: input.longitude ?? null,
      head_name: input.headName, head_phone: input.headPhone || null, head_email: input.headEmail || null,
    };
    const request$: Observable<any> = id
      ? this.api.PUT(`${ApiRoutesConstants.BRANCHES}/${id}`, body)
      : this.api.POST(ApiRoutesConstants.BRANCHES, body);
    return request$.pipe(map(res => branchFromApi(res.data)), tap(branch => this.upsert(branch)), tap(() => this.refreshStats()));
  }

  setStatus(id: string, status: BranchStatus): Observable<BranchRecord> {
    return (this.api.PATCH(`${ApiRoutesConstants.BRANCHES}/${id}/status`, { status }) as Observable<any>).pipe(
      map(res => branchFromApi(res.data)), tap(branch => this.upsert(branch)), tap(() => this.refreshStats()),
    );
  }

  remove(id: string): Observable<unknown> {
    return (this.api.Delete(`${ApiRoutesConstants.BRANCHES}/${id}`, {}) as Observable<unknown>).pipe(
      tap(() => { this.list.set(this.list().filter(b => b.id !== id)); this.refreshStats(); }),
    );
  }

  /** Branch team from HR (GET /branches/{id}/employees) as the HR Employee model, with the designation summary. */
  employees(id: string, query: { search?: string; designation?: string; status?: string } = {}): Observable<{ employees: Employee[]; summary: { total: number; byDesignation: { designation: string; count: number }[] } }> {
    const qs = new URLSearchParams({ per_page: '200' });
    Object.entries(query).forEach(([k, v]) => v && qs.set(k, v));
    return (this.api.GET(`${ApiRoutesConstants.BRANCHES}/${id}/employees?${qs}`) as Observable<any>).pipe(
      map(res => ({
        employees: ((res.data ?? []) as any[]).map(r => this.hr.employeeFromApi(r)),
        summary: {
          total: res.summary?.total ?? 0,
          byDesignation: (res.summary?.by_designation ?? []) as { designation: string; count: number }[],
        },
      })),
    );
  }

  /** Data of one details tab: attendance | leads | customers | appointments | treatments | sales | inventory | reports. */
  tab<T = any>(id: string, tab: string, params: Record<string, string> = {}): Observable<T> {
    const qs = new URLSearchParams(params).toString();
    return (this.api.GET(`${ApiRoutesConstants.BRANCHES}/${id}/${tab}${qs ? `?${qs}` : ''}`) as Observable<any>).pipe(map(res => res.data as T));
  }

  /** Server export (xlsx | csv | pdf) of the branches matching the filters. */
  export(format: string, f: BranchFilterQuery): Observable<Blob> {
    const qs = new URLSearchParams({ format });
    if (f.search) qs.set('search', f.search);
    if (f.status) qs.set('status', f.status);
    (f.cities ?? []).forEach(c => qs.append('city[]', c));
    return this.api.GET_BLOB(`${ApiRoutesConstants.BRANCHES}/export?${qs}`) as Observable<Blob>;
  }

  private upsert(branch: BranchRecord): void {
    const exists = this.list().some(b => b.id === branch.id);
    this.list.set(exists ? this.list().map(b => (b.id === branch.id ? { ...b, ...branch } : b)) : [...this.list(), branch]);
  }

  /** Stat cards depend on every branch, so re-read them after a change. */
  private refreshStats(): void {
    this.load().subscribe({ error: () => undefined });
    this.branchOptions.refresh();
  }
}

export function branchFromApi(r: any): BranchRecord {
  return {
    id: String(r.id), code: r.code, name: r.name, city: r.city ?? '', state: r.state ?? '',
    phone: r.phone ?? '', email: r.email ?? '', address: r.address ?? '',
    headName: r.head_name ?? '', headPhone: r.head_phone ?? '', headEmail: r.head_email ?? '',
    status: r.status === 'Inactive' ? 'Inactive' : 'Active', openedOn: r.opened_on ?? '',
    photo: r.photo || undefined,
    latitude: r.latitude ?? null, longitude: r.longitude ?? null,
    employees: r.employees, customers: r.customers, monthlySales: r.monthly_sales,
  };
}

function overviewFromApi(s: any): BranchOverview {
  return {
    totalBranches: s.total_branches ?? 0, newBranches: s.new_branches ?? 0, activeBranches: s.active_branches ?? 0, activePercent: s.active_percent ?? 0,
    totalEmployees: s.total_employees ?? 0, newEmployees: s.new_employees ?? 0, monthlySales: s.monthly_sales ?? 0,
    previousMonthSales: s.previous_month_sales ?? 0, salesGrowthPercent: s.sales_growth_percent ?? null,
  };
}

function summaryFromApi(s: any): BranchSummary {
  return {
    employees: s.employees ?? 0, customers: s.customers ?? 0, monthlySales: s.monthly_sales ?? 0, todaySales: s.today_sales ?? 0,
    totalCollected: s.total_collected ?? 0, receivables: s.receivables ?? 0, inventoryValue: s.inventory_value ?? 0,
    appointments: s.appointments ?? 0, leadRate: s.lead_rate ?? 0,
    employeesByDesignation: s.employees_by_designation ?? [], revenueByTreatment: s.revenue_by_treatment ?? [], funnel: s.funnel ?? [],
    monthlySeries: s.monthly_series ?? [], activities: s.activities ?? [],
  };
}
