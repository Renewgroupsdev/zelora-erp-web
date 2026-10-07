import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map } from 'rxjs';
import { CrmFlowService, FlowAppointment, FlowLead } from '../../../shared/common-services/crm-flow.service';
import { FranchiseService } from '../../../shared/common-services/franchise.service';
import { HrService } from '../../../shared/common-services/hr.service';
import { TargetsService } from '../../../shared/common-services/targets.service';
import { BfBars } from '../../../shared/components/bf-charts/bf-bars/bf-bars';
import { BfBarDatum, BfColumnDatum, BfDatum } from '../../../shared/components/bf-charts/bf-charts.model';
import { BfColumns } from '../../../shared/components/bf-charts/bf-columns/bf-columns';
import { BfDonut } from '../../../shared/components/bf-charts/bf-donut/bf-donut';
import { branchDemo } from '../../../shared/models/branch-demo.data';
import { inrShort, invoiceTotal, lastMonths, splitShare, timeAgo } from '../../../shared/models/branch-franchise.model';
import { HScroll } from '../../../shared/directives/h-scroll';
import { addDays, daysBetween, displayDate, initials, inr, isoDate } from '../../../shared/utils/format.util';
import { FranchiseForm } from '../franchise-form/franchise-form';

type Tab = 'overview' | 'agreement' | 'employees' | 'attendance' | 'leads' | 'customers' | 'appointments' | 'treatments' | 'sales' | 'inventory' | 'expenses' | 'feedback' | 'documents' | 'reports';
type Period = 'day' | 'month' | 'year';

interface LeadRow { id: string; name: string; phone: string; treatment: string; source: string; telecaller: string; followUp: string; status: string; converted: boolean; }
interface AppointmentRow { id: string; customer: string; treatment: string; date: string; time: string; staff: string; amount: number; payment: string; }
interface CustomerRow { name: string; phone: string; bills: number; billed: number; last: string; }
interface EmployeeRow { id: string; empCode: string; name: string; designation: string; phone: string; status: string; }

/** Largest `n` groups by value; everything else is rolled into "Others". */
function topGroups(map: Map<string, number>, n = 6): BfDatum[] {
  const sorted = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, n).map(([label, value]) => ({ label, value }));
  const rest = sorted.slice(n).reduce((s, [, v]) => s + v, 0);
  return rest ? [...head, { label: 'Others', value: rest }] : head;
}

const bump = (m: Map<string, number>, key: string, by = 1) => m.set(key, (m.get(key) ?? 0) + by);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/**
 * One franchise partner: owner, agreement, revenue share and a data-rich tab for every part of the outlet.
 * Each tab shows the franchise's live records (invoices, customers, staff, CRM) when there are any, and the
 * hardcoded sample set (branch-demo.data) while there are none.
 */
@Component({
  selector: 'app-franchise-details',
  standalone: true,
  imports: [CommonModule, RouterLink, MatDialogModule, HScroll, BfDonut, BfBars, BfColumns],
  templateUrl: './franchise-details.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise.scss'],
})
export class FranchiseDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly crm = inject(CrmFlowService);
  private readonly hr = inject(HrService);
  private readonly targets = inject(TargetsService);
  protected readonly store = inject(FranchiseService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly franchise = computed(() => this.store.franchise(this.id()));
  readonly tab = signal<Tab>(this.initialTab());
  readonly period = signal<Period>('month');
  readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'bi-grid-1x2-fill' }, { key: 'agreement', label: 'Agreement', icon: 'bi-file-earmark-check-fill' },
    { key: 'employees', label: 'Employees', icon: 'bi-people-fill' }, { key: 'attendance', label: 'Attendance', icon: 'bi-person-check-fill' },
    { key: 'leads', label: 'Leads', icon: 'bi-person-lines-fill' }, { key: 'customers', label: 'Customers', icon: 'bi-person-heart' },
    { key: 'appointments', label: 'Appointments', icon: 'bi-calendar2-check-fill' }, { key: 'treatments', label: 'Treatments', icon: 'bi-heart-pulse-fill' },
    { key: 'sales', label: 'Sales', icon: 'bi-graph-up-arrow' }, { key: 'inventory', label: 'Inventory', icon: 'bi-box-seam-fill' },
    { key: 'expenses', label: 'Expenses', icon: 'bi-wallet2' }, { key: 'feedback', label: 'Feedback', icon: 'bi-star-fill' },
    // { key: 'documents', label: 'Documents', icon: 'bi-file-earmark-text-fill' }, { key: 'reports', label: 'Reports', icon: 'bi-bar-chart-line-fill' },
  ];
  readonly periods: { key: Period; label: string }[] = [{ key: 'day', label: 'Day' }, { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }];

  readonly inr = inr;
  readonly inrShort = inrShort;
  readonly initials = initials;
  readonly displayDate = displayDate;
  readonly invoiceTotal = invoiceTotal;
  readonly splitShare = splitShare;
  readonly timeAgo = timeAgo;
  readonly stars = (rating: number) => { const n = Math.min(5, Math.max(0, Math.round(rating))); return '★'.repeat(n) + '☆'.repeat(5 - n); };

  private readonly name = computed(() => this.franchise()?.name ?? '');
  readonly invoices = computed(() => this.store.invoicesOf(this.id()));
  readonly totals = computed(() => this.store.totalsFor(this.id()));
  readonly monthSales = computed(() => this.invoices().filter(i => i.date.startsWith(isoDate().slice(0, 7))).reduce((s, i) => s + invoiceTotal(i.items), 0));
  readonly activities = computed(() => this.invoices().slice(0, 8));
  private readonly staff = computed(() => (this.franchise() ? this.hr.employees().filter(e => e.branch === this.franchise()!.name && e.status !== 'Exited') : []));

  /** Hardcoded sample records, used tab by tab while the live data is empty. Salted so it differs from a branch of the same name. */
  private readonly demo = computed(() => branchDemo(`F:${this.name()}`, this.staff().map(e => ({ name: e.name, designation: e.designation }))));

  // ---- CRM data lives in memory in CrmFlowService (not signals): snapshot it when a tab opens ----
  private readonly crmLeads = signal<FlowLead[]>([]);
  private readonly crmAppointments = signal<FlowAppointment[]>([]);

  constructor() {
    this.refreshCrm();
  }

  private refreshCrm(): void {
    this.crmLeads.set(this.crm.getFollowUps());
    this.crmAppointments.set(this.crm.getAppointments());
  }

  selectTab(tab: Tab): void {
    this.refreshCrm();
    this.tab.set(tab);
  }

  private readonly liveLeads = computed(() => this.crmLeads().filter(l => l.branch === this.name()));
  private readonly liveAppointments = computed(() => this.crmAppointments().filter(a => a.branch === this.name()));

  // ---- Monthly sales (invoice value) against the outlet's target ----
  /** True once the outlet has revenue targets in the Targets module; otherwise the chart shows an estimated target. */
  private readonly targetsSet = computed(() => lastMonths(7).some(m => this.targets.targetFor(this.name(), m.key).revenueTarget > 0));

  private readonly realSeries = computed(() => {
    const months = lastMonths(7).map(m => ({
      ...m,
      sales: this.invoices().filter(i => i.date.startsWith(m.key)).reduce((s, i) => s + invoiceTotal(i.items), 0),
      target: this.targets.targetFor(this.name(), m.key).revenueTarget,
    }));
    if (this.targetsSet()) return months;
    // No target set yet: aim 10% above the outlet's own average month so Sales is always read against something.
    const active = months.filter(m => m.sales > 0);
    const average = active.length ? active.reduce((s, m) => s + m.sales, 0) / active.length : 0;
    const estimate = Math.round((average * 1.1) / 100) * 100;
    return months.map(m => ({ ...m, target: estimate }));
  });

  readonly sample = computed(() => ({
    leads: !this.liveLeads().length && !this.liveAppointments().length,
    appointments: !this.liveAppointments().length,
    customers: !this.invoices().length,
    sales: this.realSeries().filter(m => m.sales > 0).length < 3,
    reports: lastMonths(12).filter(m => this.invoices().some(i => i.date.startsWith(m.key))).length < 3,
  }));

  readonly series = computed(() => (this.sample().sales ? this.demo().monthly : this.realSeries()));
  /** False while the target line is only an estimate. */
  readonly hasTarget = computed(() => this.sample().sales || this.targetsSet());
  readonly salesVsTarget = computed<BfColumnDatum[]>(() => this.series().map(m => ({ label: m.label, a: m.sales, b: m.target })));
  readonly current = computed(() => {
    const m = this.series().at(-1);
    const sales = m?.sales ?? 0;
    const target = m?.target ?? 0;
    return { sales, target, percent: pct(sales, target), balance: Math.max(target - sales, 0) };
  });

  /** Sales with the franchise / Renew split: the live invoice totals, or the sample series split at the agreed share. */
  readonly shareTotals = computed(() => {
    if (!this.sample().sales) return this.totals();
    const total = this.series().reduce((s, m) => s + m.sales, 0);
    return { ...splitShare(total, this.franchise()?.sharePercent ?? 70), invoices: 0, paid: 0 };
  });
  readonly shareSplit = computed<BfDatum[]>(() => {
    const t = this.shareTotals();
    const share = this.franchise()?.sharePercent ?? 70;
    return [{ label: `Franchise (${share}%)`, value: t.franchise }, { label: `Renew (${100 - share}%)`, value: t.renew }];
  });
  readonly unpaid = computed(() => (this.sample().sales ? Math.round(this.shareTotals().total * 0.12) : this.invoices().filter(i => i.status === 'Unpaid').reduce((s, i) => s + invoiceTotal(i.items), 0)));
  readonly receivables = this.unpaid;

  // ---- Agreement ----
  readonly agreement = computed(() => {
    const f = this.franchise();
    if (!f) return null;
    const today = isoDate();
    const total = Math.max(1, daysBetween(f.agreementFrom, f.agreementTo));
    const used = Math.min(total, Math.max(0, daysBetween(f.agreementFrom, today)));
    const left = Math.max(0, daysBetween(today, f.agreementTo));
    const state = today < f.agreementFrom ? 'Not started' : today > f.agreementTo ? 'Expired' : left <= 90 ? 'Renew soon' : 'Running';
    return { total, used, left, percent: pct(used, total), years: (total / 365).toFixed(1), state };
  });

  // ---- Employees ----
  readonly employees = computed<EmployeeRow[]>(() => {
    const f = this.franchise();
    if (this.staff().length) return this.staff().map(e => ({ id: e.id, empCode: e.empCode, name: e.name, designation: e.designation, phone: e.phone, status: e.status }));
    return this.demo().attendance.map((a, i) => ({ id: `d${i}`, empCode: `${f?.code ?? 'FR'}-${String(i + 1).padStart(2, '0')}`, name: a.name, designation: a.designation, phone: '-', status: 'Active' }));
  });
  readonly employeesByRole = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    this.employees().forEach(e => bump(m, e.designation || 'Unassigned'));
    return topGroups(m);
  });
  readonly employeeStatus = computed(() => {
    const list = this.employees();
    return { active: list.filter(e => e.status === 'Active').length, onboarding: list.filter(e => e.status === 'Onboarding').length, notice: list.filter(e => e.status === 'On Notice').length };
  });

  // ---- Attendance (today) ----
  readonly attendance = computed(() => this.demo().attendance);
  readonly attendanceStats = computed(() => {
    const list = this.attendance();
    const count = (s: string) => list.filter(a => a.status === s).length;
    return { present: count('Present'), late: count('Late'), leave: count('On Leave'), absent: count('Absent'), rate: pct(count('Present') + count('Late'), list.length) };
  });
  readonly attendanceChart = computed<BfDatum[]>(() => {
    const s = this.attendanceStats();
    return [{ label: 'Present', value: s.present }, { label: 'Late', value: s.late }, { label: 'On leave', value: s.leave }, { label: 'Absent', value: s.absent }];
  });

  // ---- Leads ----
  readonly leadRows = computed<LeadRow[]>(() => {
    if (this.sample().leads) return this.demo().leads.map(l => ({ ...l, converted: l.status === 'Appointment' }));
    const asRow = (l: FlowLead | FlowAppointment, converted: boolean): LeadRow => ({
      id: l.id, name: l.name, phone: l.phone, treatment: ('service' in l && l.service) || l.request || l.category || 'General',
      source: l.source, telecaller: l.telecaller, followUp: l.followUpDate, status: converted ? 'Converted' : l.status, converted,
    });
    return [...this.liveLeads().map(l => asRow(l, l.status === 'Appointment')), ...this.liveAppointments().map(a => asRow(a, true))];
  });
  readonly leadStats = computed(() => {
    const all = this.leadRows();
    const converted = all.filter(l => l.converted).length;
    return { total: all.length, converted, open: all.filter(l => l.status === 'Follow-Up').length, rate: pct(converted, all.length) };
  });
  readonly leadsByTreatment = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    this.leadRows().forEach(l => bump(m, l.treatment));
    return topGroups(m);
  });
  readonly conversionByTreatment = computed<BfBarDatum[]>(() => {
    const total = new Map<string, number>();
    const conv = new Map<string, number>();
    for (const l of this.leadRows()) { bump(total, l.treatment); if (l.converted) bump(conv, l.treatment); }
    return topGroups(total).map(d => ({ ...d, secondary: conv.get(d.label) ?? 0 }));
  });

  // ---- Customers (from franchise invoices) ----
  private readonly liveCustomers = computed<CustomerRow[]>(() => {
    const byName = new Map<string, CustomerRow>();
    for (const inv of this.invoices()) {
      const key = inv.customer.toLowerCase();
      const row = byName.get(key) ?? { name: inv.customer, phone: '', bills: 0, billed: 0, last: '' };
      row.bills++;
      row.billed += invoiceTotal(inv.items);
      if (inv.date > row.last) row.last = inv.date;
      byName.set(key, row);
    }
    return [...byName.values()].sort((a, b) => b.last.localeCompare(a.last));
  });
  readonly customers = computed<CustomerRow[]>(() => (this.sample().customers ? this.demo().customers : this.liveCustomers()));
  readonly customerStats = computed(() => {
    const list = this.customers();
    const billed = list.reduce((s, c) => s + c.billed, 0);
    return { total: list.length, repeat: list.filter(c => c.bills > 1).length, billed, average: list.length ? billed / list.length : 0 };
  });
  /** What each customer bought: invoice line items live, treatments in the sample set. */
  readonly customersByTreatment = computed<BfDatum[]>(() => {
    if (this.sample().customers) {
      const m = new Map<string, number>();
      this.demo().customers.forEach(c => bump(m, c.treatment));
      return topGroups(m);
    }
    const sets = new Map<string, Set<string>>();
    for (const inv of this.invoices()) for (const i of inv.items) {
      const set = sets.get(i.name) ?? new Set<string>();
      set.add(inv.customer.toLowerCase());
      sets.set(i.name, set);
    }
    return topGroups(new Map([...sets].map(([k, v]) => [k, v.size])));
  });
  readonly revenueByTreatment = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    if (this.sample().customers) { this.demo().treatments.forEach(t => bump(m, t.name, t.revenue)); return topGroups(m); }
    for (const inv of this.invoices()) for (const i of inv.items) bump(m, i.name, i.qty * i.unitPrice);
    return topGroups(m);
  });
  readonly productSales = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    for (const inv of this.invoices()) for (const i of inv.items) bump(m, i.name, i.qty * i.unitPrice);
    return m.size ? topGroups(m) : this.demo().products.map(p => ({ label: p.name, value: p.amount })).sort((a, b) => b.value - a.value);
  });
  readonly billedTotal = computed(() => (this.sample().customers ? this.customers().reduce((s, c) => s + c.billed, 0) : this.totals().total));

  // ---- Appointments ----
  readonly appointmentRows = computed<AppointmentRow[]>(() => {
    if (this.sample().appointments) return this.demo().appointments.map(a => ({ ...a }));
    return this.liveAppointments().map(a => ({ id: a.id, customer: a.name, treatment: a.service || 'General', date: a.date, time: a.startTime, staff: a.staff, amount: a.total, payment: a.paymentStatus }));
  });
  readonly appointments = this.appointmentRows;
  readonly appointmentStats = computed(() => {
    const list = this.appointmentRows();
    return { total: list.length, paid: list.filter(a => a.payment === 'Paid').length, pending: list.filter(a => a.payment !== 'Paid').length, value: list.reduce((s, a) => s + (a.amount || 0), 0) };
  });
  readonly appointmentsByTreatment = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    this.appointmentRows().forEach(a => bump(m, a.treatment));
    return topGroups(m);
  });
  readonly appointmentPayments = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    this.appointmentRows().forEach(a => bump(m, a.payment));
    return topGroups(m);
  });

  // ---- Treatments offered ----
  readonly treatments = computed(() => this.demo().treatments.slice().sort((a, b) => b.revenue - a.revenue));
  readonly treatmentStats = computed(() => {
    const list = this.treatments();
    return { count: list.length, sessions: list.reduce((s, t) => s + t.sessions, 0), revenue: list.reduce((s, t) => s + t.revenue, 0), best: list[0]?.name ?? '-' };
  });
  readonly treatmentsByCategory = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    this.treatments().forEach(t => bump(m, t.category, t.revenue));
    return topGroups(m);
  });
  readonly treatmentSessions = computed<BfDatum[]>(() => this.treatments().slice().sort((a, b) => b.sessions - a.sessions).slice(0, 7).map(t => ({ label: t.name, value: t.sessions })));

  // ---- Inventory: sample products, valued so they add up to the stock value the partner reported ----
  readonly stockByProduct = computed(() => {
    const rows = this.demo().stock.map(s => ({ name: s.name, code: s.code, qty: s.qty, value: s.qty * s.unitPrice, batches: s.batches }));
    const reported = this.franchise()?.inventoryValue ?? 0;
    const sum = rows.reduce((s, r) => s + r.value, 0);
    const scale = reported > 0 && sum > 0 ? reported / sum : 1;
    return rows.map(r => ({ ...r, value: Math.round(r.value * scale) })).sort((a, b) => b.value - a.value);
  });
  readonly stockTotal = computed(() => this.stockByProduct().reduce((s, p) => s + p.value, 0));
  readonly stockStats = computed(() => ({
    products: this.stockByProduct().length,
    units: this.stockByProduct().reduce((s, p) => s + p.qty, 0),
    expiring: this.demo().stock.reduce((s, p) => s + p.expiring, 0),
  }));
  readonly stockValueData = computed<BfDatum[]>(() => topGroups(new Map(this.stockByProduct().map(p => [p.name, p.value]))));
  readonly stockQtyData = computed<BfDatum[]>(() => this.stockByProduct().slice().sort((a, b) => b.qty - a.qty).slice(0, 8).map(p => ({ label: p.name, value: p.qty })));

  // ---- Expenses ----
  readonly expenses = computed(() => this.demo().expenses);
  readonly expenseStats = computed(() => {
    const list = this.expenses();
    const total = list.reduce((s, e) => s + e.amount, 0);
    const pending = list.filter(e => e.status === 'Pending');
    return { total, count: list.length, pending: pending.reduce((s, e) => s + e.amount, 0), pendingCount: pending.length, ratio: pct(total, this.current().sales || total) };
  });
  readonly expensesByCategory = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    this.expenses().forEach(e => bump(m, e.category, e.amount));
    return topGroups(m);
  });
  readonly expenseMonthly = computed<BfColumnDatum[]>(() => this.demo().expenseMonthly.map((e, i) => ({ label: e.label, a: e.amount, b: this.series()[i]?.sales ?? 0 })));

  // ---- Feedback ----
  readonly reviews = computed(() => this.demo().reviews);
  readonly feedbackStats = computed(() => {
    const list = this.reviews();
    const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
    return { avg: Math.round(avg * 10) / 10, total: list.length, five: pct(list.filter(r => r.rating === 5).length, list.length), unanswered: list.filter(r => !r.replied).length };
  });
  readonly ratingSpread = computed<BfBarDatum[]>(() => [5, 4, 3, 2, 1].map(n => ({ label: `${n} star`, value: this.reviews().filter(r => r.rating === n).length })));
  readonly ratingByTreatment = computed<BfBarDatum[]>(() => this.treatments().slice(0, 6).map(t => ({ label: t.name, value: Math.round(t.rating * 10) / 10 })));

  // ---- Documents & licences ----
  readonly documents = computed(() => this.demo().documents);
  readonly documentStats = computed(() => {
    const list = this.documents();
    const count = (s: string) => list.filter(d => d.status === s).length;
    return { total: list.length, valid: count('Valid'), expiring: count('Expiring'), expired: count('Expired') };
  });
  readonly documentChart = computed<BfDatum[]>(() => {
    const s = this.documentStats();
    return [{ label: 'Valid', value: s.valid }, { label: 'Expiring soon', value: s.expiring }, { label: 'Expired', value: s.expired }];
  });

  // ---- Reports: day / month / year ----
  private readonly periodKeys = computed(() => {
    const today = isoDate();
    switch (this.period()) {
      case 'day': return Array.from({ length: 14 }, (_, i) => { const d = addDays(today, i - 13); return { key: d, label: new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }; });
      case 'year': return Array.from({ length: 5 }, (_, i) => { const y = String(new Date().getFullYear() - 4 + i); return { key: y, label: y }; });
      default: return lastMonths(12);
    }
  });
  readonly report = computed(() => {
    if (!this.name()) return [];
    if (this.sample().reports) return this.demo().periods[this.period()];
    return this.periodKeys().map(p => {
      const list = this.invoices().filter(i => i.date.startsWith(p.key));
      return { ...p, sales: list.reduce((s, i) => s + invoiceTotal(i.items), 0), bills: list.length, appointments: this.liveAppointments().filter(a => (a.date ?? '').startsWith(p.key)).length };
    });
  });
  readonly reportSales = computed<BfColumnDatum[]>(() => this.report().map(r => ({ label: r.label, a: r.sales })));
  readonly reportActivity = computed<BfColumnDatum[]>(() => this.report().map(r => ({ label: r.label, a: r.bills, b: r.appointments })));
  readonly reportTotals = computed(() => {
    const r = this.report();
    return { sales: r.reduce((s, x) => s + x.sales, 0), bills: r.reduce((s, x) => s + x.bills, 0), appointments: r.reduce((s, x) => s + x.appointments, 0) };
  });
  /** How far leads travel before they turn into paid invoices. */
  readonly funnel = computed<BfBarDatum[]>(() => {
    const invoices = this.sample().customers ? this.customers().reduce((s, c) => s + c.bills, 0) : this.invoices().length;
    const paid = this.sample().customers ? Math.round(invoices * 0.8) : this.invoices().filter(i => i.status === 'Paid').length;
    return [{ label: 'Leads', value: this.leadStats().total }, { label: 'Appointments', value: this.appointmentRows().length }, { label: 'Invoices raised', value: invoices }, { label: 'Invoices paid', value: paid }];
  });

  /** `?tab=sales` (used by the list page's quick actions) opens that tab straight away. */
  private initialTab(): Tab {
    const wanted = this.route.snapshot.queryParamMap.get('tab');
    const valid: Tab[] = ['overview', 'agreement', 'employees', 'attendance', 'leads', 'customers', 'appointments', 'treatments', 'sales', 'inventory', 'expenses', 'feedback', 'documents', 'reports'];
    return valid.find(t => t === wanted) ?? 'overview';
  }

  edit(): void {
    if (!this.franchise()) return;
    this.dialog.open(FranchiseForm, { width: '860px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { franchiseId: this.franchise()!.id } });
  }

  back(): void {
    this.router.navigate(['/app/franchises']);
  }
}
