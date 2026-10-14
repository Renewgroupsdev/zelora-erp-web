import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { FranchiseRecord, FranchiseStatus } from '../models/branch-franchise.model';
import { ApiRoutesConstants } from './api-route-constants';

/** The five cards on the list page (GET /franchises -> stats). */
export interface FranchiseOverview {
  totalFranchises: number;
  activeFranchises: number;
  pendingFranchises: number;
  totalSales: number;
  renewShare: number;
  renewPercent: number;
  salesGrowthPercent: number | null;
}

export interface FranchiseTotals {
  total: number;
  franchise: number;
  renew: number;
  invoices: number;
  paid: number;
}

export interface LabelValue { label: string; value: number; }

export interface FranchiseSeriesPoint { key: string; label: string; sales: number; franchise: number; renew: number; invoices: number; }

export interface FranchiseInvoiceLine { name: string; qty: number; unitPrice: number; amount: number; }

/** An invoice the partner raised, split at the share in force on its date. */
export interface FranchiseInvoiceRow {
  id: string;
  invoiceNo: string;
  date: string;
  customer: string;
  customerPhone: string;
  status: 'Paid' | 'Unpaid';
  notes: string;
  total: number;
  sharePercent: number;
  franchiseShare: number;
  renewShare: number;
  items: FranchiseInvoiceLine[];
}

/** GET /franchises/{id} -> summary: what the details header and overview tab show. */
export interface FranchiseSummary {
  totals: FranchiseTotals;
  monthSales: number;
  unpaid: number;
  monthlySeries: FranchiseSeriesPoint[];
  recentInvoices: { id: number; invoice_no: string; date: string; customer: string; status: string; total: number }[];
  byProduct: LabelValue[];
  shareSplit: LabelValue[];
}

export interface NewInvoiceInput {
  customer: string;
  customerPhone?: string;
  date?: string;
  status: 'Paid' | 'Unpaid';
  notes?: string;
  items: { name: string; qty: number; unitPrice: number }[];
}

export interface FranchiseFilterQuery {
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
 * Franchise Management, backed by the API (/franchises). Every invoice is split between the franchise partner and
 * Renew at the share in force on the invoice date (the server does the split and keeps the share history).
 */
@Injectable({ providedIn: 'root' })
export class FranchiseService {
  private readonly api = inject(ApiDataService);

  private readonly list = signal<FranchiseRecord[]>([]);
  private readonly overviewState = signal<FranchiseOverview | null>(null);
  readonly loading = signal(false);
  readonly franchises = computed(() => this.list());
  readonly overview = computed(() => this.overviewState());

  franchise(id: string): FranchiseRecord | undefined {
    return this.list().find(f => f.id === id);
  }

  /** Every franchise (a small list, so the screen filters / sorts / pages it in the browser) plus the stat cards. */
  load(): Observable<FranchiseRecord[]> {
    this.loading.set(true);
    return (this.api.GET(`${ApiRoutesConstants.FRANCHISES}?per_page=200&sort_by=code&sort_direction=asc`) as Observable<any>).pipe(
      tap({ error: () => this.loading.set(false) }),
      map(res => {
        this.overviewState.set(res.stats ? overviewFromApi(res.stats) : null);
        const rows = ((res.data ?? []) as any[]).map(franchiseFromApi);
        this.list.set(rows);
        this.loading.set(false);
        return rows;
      }),
    );
  }

  /** One franchise with its summary (also refreshes the copy in the list). */
  fetch(id: string): Observable<{ franchise: FranchiseRecord; summary: FranchiseSummary }> {
    return (this.api.GET(`${ApiRoutesConstants.FRANCHISES}/${id}`) as Observable<any>).pipe(
      map(res => {
        const franchise = franchiseFromApi(res.data);
        this.upsert(franchise);
        return { franchise, summary: summaryFromApi(res.data.summary ?? {}) };
      }),
    );
  }

  /** Creates (id = null) or updates a franchise. Emits the saved record; errors carry the API message. */
  save(id: string | null, input: Omit<FranchiseRecord, 'id' | 'code'>): Observable<FranchiseRecord> {
    const body = {
      name: input.name, owner_company: input.ownerCompany, owner_name: input.ownerName, owner_phone: input.ownerPhone || null,
      owner_email: input.ownerEmail || null, city: input.city, state: input.state || null, gstin: input.gstin || null, status: input.status,
      agreement_from: input.agreementFrom || null, agreement_to: input.agreementTo || null,
      share_percent: input.sharePercent, share_effective_from: input.shareEffectiveFrom || null,
      employees: input.employees || 0, inventory_value: input.inventoryValue || 0, photo: input.photo || null,
      latitude: input.latitude ?? null, longitude: input.longitude ?? null,
      additional_owners: (input.additionalOwners ?? []).map(o => ({ name: o.name, company: o.company || null, phone: o.phone || null, email: o.email || null })),
    };
    const request$: Observable<any> = id
      ? this.api.PUT(`${ApiRoutesConstants.FRANCHISES}/${id}`, body)
      : this.api.POST(ApiRoutesConstants.FRANCHISES, body);
    return request$.pipe(map(res => franchiseFromApi(res.data)), tap(f => this.upsert(f)), tap(() => this.refresh()));
  }

  remove(id: string): Observable<unknown> {
    return (this.api.Delete(`${ApiRoutesConstants.FRANCHISES}/${id}`, {}) as Observable<unknown>).pipe(
      tap(() => { this.list.set(this.list().filter(f => f.id !== id)); this.refresh(); }),
    );
  }

  setStatus(id: string, status: FranchiseStatus): Observable<FranchiseRecord> {
    return (this.api.PATCH(`${ApiRoutesConstants.FRANCHISES}/${id}/status`, { status }) as Observable<any>).pipe(
      map(res => franchiseFromApi(res.data)), tap(f => this.upsert(f)), tap(() => this.refresh()),
    );
  }

  /** Data of one details tab: sales | customers | inventory | reports. */
  tab<T = any>(id: string, tab: string, params: Record<string, string> = {}): Observable<T> {
    const qs = new URLSearchParams(params).toString();
    return (this.api.GET(`${ApiRoutesConstants.FRANCHISES}/${id}/${tab}${qs ? `?${qs}` : ''}`) as Observable<any>).pipe(map(res => res.data as T));
  }

  // ---- Invoices ----
  invoices(id: string): Observable<{ invoices: FranchiseInvoiceRow[]; totals: { invoices: number; total: number; franchise: number; renew: number } }> {
    return (this.api.GET(`${ApiRoutesConstants.FRANCHISES}/${id}/invoices?per_page=200`) as Observable<any>).pipe(
      map(res => ({ invoices: ((res.data ?? []) as any[]).map(invoiceFromApi), totals: res.totals ?? { invoices: 0, total: 0, franchise: 0, renew: 0 } })),
    );
  }

  addInvoice(id: string, input: NewInvoiceInput): Observable<FranchiseInvoiceRow> {
    const body = {
      customer: input.customer, customer_phone: input.customerPhone || null, date: input.date || null, status: input.status, notes: input.notes || null,
      items: input.items.map(i => ({ name: i.name, qty: i.qty, unit_price: i.unitPrice })),
    };
    return (this.api.POST(`${ApiRoutesConstants.FRANCHISES}/${id}/invoices`, body) as Observable<any>).pipe(map(res => invoiceFromApi(res.data)));
  }

  setInvoiceStatus(id: string, invoiceId: string, status: 'Paid' | 'Unpaid'): Observable<FranchiseInvoiceRow> {
    return (this.api.PATCH(`${ApiRoutesConstants.FRANCHISES}/${id}/invoices/${invoiceId}/status`, { status }) as Observable<any>).pipe(map(res => invoiceFromApi(res.data)));
  }

  cancelInvoice(id: string, invoiceId: string): Observable<unknown> {
    return this.api.Delete(`${ApiRoutesConstants.FRANCHISES}/${id}/invoices/${invoiceId}`, {}) as Observable<unknown>;
  }

  /** Server export (xlsx | csv | pdf) of the franchises matching the filters. */
  export(format: string, f: FranchiseFilterQuery): Observable<Blob> {
    const qs = new URLSearchParams({ format });
    if (f.search) qs.set('search', f.search);
    if (f.status) qs.set('status', f.status);
    (f.cities ?? []).forEach(c => qs.append('city[]', c));
    return this.api.GET_BLOB(`${ApiRoutesConstants.FRANCHISES}/export?${qs}`) as Observable<Blob>;
  }

  private upsert(franchise: FranchiseRecord): void {
    const exists = this.list().some(f => f.id === franchise.id);
    this.list.set(exists ? this.list().map(f => (f.id === franchise.id ? { ...f, ...franchise } : f)) : [...this.list(), franchise]);
  }

  /** Stat cards and per-row totals depend on every franchise, so re-read them after a change. */
  private refresh(): void {
    this.load().subscribe({ error: () => undefined });
  }
}

export function franchiseFromApi(r: any): FranchiseRecord {
  return {
    id: String(r.id), code: r.code, name: r.name, ownerCompany: r.owner_company ?? '', ownerName: r.owner_name ?? '',
    ownerPhone: r.owner_phone ?? '', ownerEmail: r.owner_email ?? '',
    additionalOwners: ((r.additional_owners ?? []) as any[]).map(o => ({ company: o.company ?? '', name: o.name ?? '', phone: o.phone ?? '', email: o.email ?? '' })),
    city: r.city ?? '', state: r.state ?? '', gstin: r.gstin ?? '', status: r.status,
    agreementFrom: r.agreement_from ?? '', agreementTo: r.agreement_to ?? '',
    sharePercent: Number(r.share_percent ?? 0), shareEffectiveFrom: r.share_effective_from ?? '',
    employees: Number(r.employees ?? 0), inventoryValue: Number(r.inventory_value ?? 0),
    photo: r.photo || undefined, latitude: r.latitude ?? null, longitude: r.longitude ?? null,
    totalSales: r.total_sales, franchiseShareTotal: r.franchise_share_total, renewShareTotal: r.renew_share_total,
    invoicesCount: r.invoices_count, paidCount: r.paid_count,
  };
}

function invoiceFromApi(r: any): FranchiseInvoiceRow {
  return {
    id: String(r.id), invoiceNo: r.invoice_no, date: r.date, customer: r.customer, customerPhone: r.customer_phone ?? '',
    status: r.status, notes: r.notes ?? '', total: Number(r.total ?? 0), sharePercent: Number(r.share_percent ?? 0),
    franchiseShare: Number(r.franchise_share ?? 0), renewShare: Number(r.renew_share ?? 0),
    items: ((r.items ?? []) as any[]).map(i => ({ name: i.name, qty: i.qty, unitPrice: Number(i.unit_price), amount: Number(i.amount) })),
  };
}

function overviewFromApi(s: any): FranchiseOverview {
  return {
    totalFranchises: s.total_franchises ?? 0, activeFranchises: s.active_franchises ?? 0, pendingFranchises: s.pending_franchises ?? 0,
    totalSales: s.total_sales ?? 0, renewShare: s.renew_share ?? 0, renewPercent: s.renew_percent ?? 0, salesGrowthPercent: s.sales_growth_percent ?? null,
  };
}

function summaryFromApi(s: any): FranchiseSummary {
  return {
    totals: s.totals ?? { total: 0, franchise: 0, renew: 0, invoices: 0, paid: 0 }, monthSales: s.month_sales ?? 0, unpaid: s.unpaid ?? 0,
    monthlySeries: s.monthly_series ?? [], recentInvoices: s.recent_invoices ?? [], byProduct: s.by_product ?? [], shareSplit: s.share_split ?? [],
  };
}
