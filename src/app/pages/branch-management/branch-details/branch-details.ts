import { GeoLocationCard } from '../../../shared/components/geo-location-card/geo-location-card';
import { CommonModule } from '@angular/common';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map } from 'rxjs';
import { BranchService, BranchSummary, LabelValue, SeriesPoint } from '../../../shared/common-services/branch.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { BfBars } from '../../../shared/components/bf-charts/bf-bars/bf-bars';
import { BfBarDatum, BfColumnDatum, BfDatum } from '../../../shared/components/bf-charts/bf-charts.model';
import { BfColumns } from '../../../shared/components/bf-charts/bf-columns/bf-columns';
import { BfDonut } from '../../../shared/components/bf-charts/bf-donut/bf-donut';
import { BranchRecord } from '../../../shared/models/branch-franchise.model';
import { Employee } from '../../../shared/models/hr.model';
import { inrShort } from '../../../shared/models/branch-franchise.model';
import { displayDate, initials, inr } from '../../../shared/utils/format.util';
import { HScroll } from '../../../shared/directives/h-scroll';
import { BranchForm } from '../branch-form/branch-form';

type Tab = 'overview' | 'employees' | 'attendance' | 'leads' | 'customers' | 'appointments' | 'treatments' | 'sales' | 'inventory' | 'reports';
type Period = 'day' | 'month' | 'year';

/** Largest `n` groups by value; everything else is rolled into "Others". */
function topGroups(rows: BfDatum[], n = 6): BfDatum[] {
  const sorted = rows.filter(r => r.value > 0).sort((a, b) => b.value - a.value);
  const rest = sorted.slice(n).reduce((s, r) => s + r.value, 0);
  return rest ? [...sorted.slice(0, n), { label: 'Others', value: rest }] : sorted.slice(0, n);
}

/**
 * One branch: identity, head, KPIs and a data-rich tab for every part of its operation. Every figure comes from the
 * API (GET /branches/{id} for the header + overview, GET /branches/{id}/{tab} for each tab); a tab without records
 * simply shows its empty state.
 */
@Component({
  selector: 'app-branch-details',
  standalone: true,
  imports: [CommonModule, RouterLink, MatDialogModule, BfDonut, BfBars, BfColumns, HScroll, GeoLocationCard, CanActionDirective],
  templateUrl: './branch-details.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise.scss'],
})
export class BranchDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(BranchService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly branch = computed<BranchRecord | undefined>(() => this.store.branch(this.id()));
  readonly summary = signal<BranchSummary | null>(null);
  readonly loading = signal(true);
  readonly tabLoading = signal(false);
  readonly tab = signal<Tab>(this.initialTab());
  readonly period = signal<Period>('month');

  readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'bi-grid-1x2-fill' }, { key: 'employees', label: 'Employees', icon: 'bi-people-fill' },
    { key: 'attendance', label: 'Attendance', icon: 'bi-person-check-fill' }, { key: 'leads', label: 'Leads', icon: 'bi-person-lines-fill' },
    { key: 'customers', label: 'Customers', icon: 'bi-person-heart' }, { key: 'appointments', label: 'Appointments', icon: 'bi-calendar2-check-fill' },
    { key: 'treatments', label: 'Treatments', icon: 'bi-heart-pulse-fill' }, { key: 'sales', label: 'Sales', icon: 'bi-graph-up-arrow' },
    { key: 'inventory', label: 'Inventory', icon: 'bi-box-seam-fill' }, { key: 'reports', label: 'Reports', icon: 'bi-bar-chart-line-fill' },
  ];
  readonly periods: { key: Period; label: string }[] = [{ key: 'day', label: 'Day' }, { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }];

  readonly inr = inr;
  readonly inrShort = inrShort;
  readonly initials = initials;
  readonly displayDate = displayDate;

  // ---- Per-tab API data (null until the tab has loaded) ----
  private readonly employeeList = signal<Employee[]>([]);
  private readonly attendanceData = signal<any>(null);
  private readonly leadData = signal<any>(null);
  private readonly customerData = signal<any>(null);
  private readonly appointmentData = signal<any>(null);
  private readonly treatmentData = signal<any>(null);
  private readonly salesData = signal<any>(null);
  private readonly inventoryData = signal<any>(null);
  private readonly reportData = signal<any>(null);

  constructor() {
    // Load the branch whenever the route id changes, then its first tab.
    effect(() => {
      const id = this.id();
      if (!id) return;
      this.loading.set(true);
      this.store.fetch(id).subscribe({
        next: res => { this.summary.set(res.summary); this.loading.set(false); this.loadTab(); },
        error: () => { this.summary.set(null); this.loading.set(false); },
      });
    });
  }

  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.loadTab();
  }

  setPeriod(period: Period): void {
    this.period.set(period);
    this.loadTab();
  }

  /** Fetches the data of the open tab (the overview already came with the branch). */
  private loadTab(): void {
    const id = this.id();
    const tab = this.tab();
    if (!id || tab === 'overview') return;
    this.tabLoading.set(true);
    const done = () => this.tabLoading.set(false);
    const fail = (err: any) => { done(); this.toast.error(err?.error?.message || 'Failed to load this tab. Please try again.'); };

    if (tab === 'employees') return void this.store.employees(id).subscribe({ next: r => { this.employeeList.set(r.employees); done(); }, error: fail });

    const target = ({ attendance: this.attendanceData, leads: this.leadData, customers: this.customerData, appointments: this.appointmentData,
      treatments: this.treatmentData, sales: this.salesData, inventory: this.inventoryData, reports: this.reportData } as const)[tab];
    this.store.tab(id, tab, tab === 'reports' ? { period: this.period() } : {}).subscribe({ next: data => { target.set(data); done(); }, error: fail });
  }

  // ---- Overview ----
  readonly monthlySales = computed(() => this.summary()?.monthlySales ?? 0);
  readonly receivables = computed(() => this.summary()?.receivables ?? 0);
  readonly leadRate = computed(() => this.summary()?.leadRate ?? 0);
  readonly appointmentCount = computed(() => this.summary()?.appointments ?? 0);
  readonly activities = computed(() => this.summary()?.activities ?? []);
  readonly salesSeries = computed<BfColumnDatum[]>(() => (this.summary()?.monthlySeries ?? []).map((m: SeriesPoint) => ({ label: m.label, a: m.sales })));
  readonly overviewFunnel = computed<BfBarDatum[]>(() => (this.summary()?.funnel ?? []).map((f: LabelValue) => ({ label: f.label, value: f.value })));
  readonly overviewRevenue = computed<BfDatum[]>(() => topGroups((this.summary()?.revenueByTreatment ?? []).map(r => ({ ...r }))));
  readonly overviewRoles = computed<BfDatum[]>(() => topGroups((this.summary()?.employeesByDesignation ?? []).map(d => ({ label: d.designation, value: d.count }))));

  // ---- Employees ----
  readonly employees = this.employeeList.asReadonly();
  readonly employeesByRole = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    this.employeeList().forEach(e => m.set(e.designation || 'Unassigned', (m.get(e.designation || 'Unassigned') ?? 0) + 1));
    return topGroups([...m].map(([label, value]) => ({ label, value })));
  });
  readonly employeeStatus = computed(() => {
    const list = this.employeeList();
    return { active: list.filter(e => e.status === 'Active').length, onboarding: list.filter(e => e.status === 'Onboarding').length, notice: list.filter(e => e.status === 'On Notice').length };
  });

  // ---- Attendance (today) ----
  readonly attendance = computed<any[]>(() => this.attendanceData()?.rows ?? []);
  readonly attendanceStats = computed(() => this.attendanceData()?.stats ?? { total: 0, present: 0, late: 0, half_day: 0, on_leave: 0, absent: 0, not_marked: 0, rate: 0 });
  readonly attendanceChart = computed<BfDatum[]>(() => {
    const s = this.attendanceStats();
    return [{ label: 'Present', value: s.present }, { label: 'Late', value: s.late }, { label: 'Half day', value: s.half_day }, { label: 'On leave', value: s.on_leave }, { label: 'Absent', value: s.absent }, { label: 'Not marked', value: s.not_marked }];
  });

  // ---- Leads ----
  readonly leadRows = computed<any[]>(() => this.leadData()?.rows ?? []);
  readonly leadStats = computed(() => this.leadData()?.stats ?? { total: 0, converted: 0, open: 0, rate: 0 });
  readonly leadsByTreatment = computed<BfDatum[]>(() => topGroups(this.leadData()?.by_treatment ?? []));
  readonly leadsBySource = computed<BfBarDatum[]>(() => (this.leadData()?.by_source ?? []).slice(0, 8));

  // ---- Customers ----
  readonly customers = computed<any[]>(() => this.customerData()?.rows ?? []);
  readonly customerStats = computed(() => this.customerData()?.stats ?? { total: 0, repeat: 0, billed: 0, average: 0 });
  readonly customersByTreatment = computed<BfDatum[]>(() => topGroups(this.customerData()?.by_treatment ?? []));
  readonly customerRevenue = computed<BfDatum[]>(() => topGroups(this.customerData()?.revenue_by_treatment ?? []));

  // ---- Appointments ----
  readonly appointmentRows = computed<any[]>(() => this.appointmentData()?.rows ?? []);
  readonly appointmentStats = computed(() => this.appointmentData()?.stats ?? { total: 0, paid: 0, pending: 0, value: 0 });
  readonly appointmentsByTreatment = computed<BfDatum[]>(() => topGroups(this.appointmentData()?.by_treatment ?? []));
  readonly appointmentsByStatus = computed<BfBarDatum[]>(() => this.appointmentData()?.by_status ?? []);

  // ---- Treatments ----
  readonly treatments = computed<any[]>(() => this.treatmentData()?.rows ?? []);
  readonly treatmentStats = computed(() => this.treatmentData()?.stats ?? { count: 0, sessions: 0, revenue: 0, best: null });
  readonly treatmentRevenue = computed<BfDatum[]>(() => topGroups(this.treatments().map(t => ({ label: t.name, value: t.revenue }))));
  readonly treatmentSessions = computed<BfDatum[]>(() => this.treatments().slice().sort((a, b) => b.sessions - a.sessions).slice(0, 7).map(t => ({ label: t.name, value: t.sessions })));

  // ---- Sales ----
  readonly salesStats = computed(() => this.salesData()?.stats ?? { this_month: 0, last_month: 0, total: 0, receivables: 0 });
  readonly salesColumns = computed<BfColumnDatum[]>(() => (this.salesData()?.series ?? []).map((m: SeriesPoint) => ({ label: m.label, a: m.sales })));
  readonly salesByTreatment = computed<BfDatum[]>(() => topGroups(this.salesData()?.by_treatment ?? []));
  readonly salesByMode = computed<BfBarDatum[]>(() => this.salesData()?.by_mode ?? []);
  readonly recentSales = computed<any[]>(() => this.salesData()?.recent ?? []);

  // ---- Inventory ----
  readonly stock = computed<any[]>(() => this.inventoryData()?.rows ?? []);
  readonly stockTotal = computed(() => this.inventoryData()?.total_value ?? 0);
  readonly stockStats = computed(() => this.inventoryData()?.stats ?? { products: 0, units: 0, expiring: 0, expired: 0 });
  readonly stockValueData = computed<BfDatum[]>(() => topGroups(this.stock().map(p => ({ label: p.name, value: p.value }))));
  readonly stockQtyData = computed<BfDatum[]>(() => this.stock().slice().sort((a, b) => b.qty - a.qty).slice(0, 8).map(p => ({ label: p.name, value: p.qty })));

  // ---- Reports: day / month / year ----
  readonly report = computed<SeriesPoint[]>(() => this.reportData()?.rows ?? []);
  readonly reportTotals = computed(() => this.reportData()?.totals ?? { sales: 0, bills: 0, appointments: 0 });
  readonly reportSales = computed<BfColumnDatum[]>(() => this.report().map(r => ({ label: r.label, a: r.sales })));
  readonly reportActivity = computed<BfColumnDatum[]>(() => this.report().map(r => ({ label: r.label, a: r.bills, b: r.appointments })));
  readonly reportFunnel = computed<BfBarDatum[]>(() => this.reportData()?.funnel ?? []);

  attendanceClass(status: string): string {
    return status === 'Present' ? 'active' : status === 'Absent' ? 'inactive' : 'pending';
  }

  /** `?tab=customers` (used by the list page's quick actions) opens that tab straight away. */
  private initialTab(): Tab {
    const wanted = this.route.snapshot.queryParamMap.get('tab');
    const valid: Tab[] = ['overview', 'employees', 'attendance', 'leads', 'customers', 'appointments', 'treatments', 'sales', 'inventory', 'reports'];
    return valid.find(t => t === wanted) ?? 'overview';
  }

  edit(): void {
    if (!this.branch()) return;
    this.dialog.open(BranchForm, { width: '860px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { branchId: this.branch()!.id } })
      .afterClosed().subscribe(saved => saved && this.store.fetch(this.id()).subscribe(res => this.summary.set(res.summary)));
  }

  back(): void {
    this.router.navigate(['/app/branches']);
  }
}
