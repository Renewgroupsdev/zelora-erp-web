import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map } from 'rxjs';
import { AccountsService } from '../../../shared/common-services/accounts.service';
import { BranchService } from '../../../shared/common-services/branch.service';
import { CrmFlowService, FlowAppointment, FlowLead } from '../../../shared/common-services/crm-flow.service';
import { BfBars } from '../../../shared/components/bf-charts/bf-bars/bf-bars';
import { BfBarDatum, BfColumnDatum, BfDatum } from '../../../shared/components/bf-charts/bf-charts.model';
import { BfColumns } from '../../../shared/components/bf-charts/bf-columns/bf-columns';
import { BfDonut } from '../../../shared/components/bf-charts/bf-donut/bf-donut';
import { branchDemo } from '../../../shared/models/branch-demo.data';
import { axisShort, chartTicks, inrShort, lastMonths } from '../../../shared/models/branch-franchise.model';
import { BillItem, billTotals, lineAmount } from '../../../shared/models/accounts.model';
import { addDays, displayDate, initials, inr, isoDate } from '../../../shared/utils/format.util';
import { HScroll } from '../../../shared/directives/h-scroll';
import { BranchForm } from '../branch-form/branch-form';

type Tab = 'overview' | 'employees' | 'attendance' | 'leads' | 'customers' | 'appointments' | 'treatments' | 'sales' | 'inventory' | 'expenses' | 'feedback' | 'documents' | 'reports';
type Period = 'day' | 'month' | 'year';

interface LeadRow { id: string; name: string; phone: string; treatment: string; source: string; telecaller: string; followUp: string; status: string; converted: boolean; }
interface AppointmentRow { id: string; customer: string; treatment: string; date: string; time: string; staff: string; amount: number; payment: string; }
interface CustomerRow { name: string; phone: string; bills: number; billed: number; last: string; }

/** Largest `n` groups by value; everything else is rolled into "Others". */
function topGroups(map: Map<string, number>, n = 6): BfDatum[] {
  const sorted = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, n).map(([label, value]) => ({ label, value }));
  const rest = sorted.slice(n).reduce((s, [, v]) => s + v, 0);
  return rest ? [...head, { label: 'Others', value: rest }] : head;
}

const bump = (m: Map<string, number>, key: string, by = 1) => m.set(key, (m.get(key) ?? 0) + by);
/** Billing treats SAC 99xxxx lines as services; everything else is a product (HSN). */
const isService = (i: BillItem) => (i.sac ?? '').startsWith('99');
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/**
 * One branch: identity, head, KPIs and a data-rich tab for every part of its operation.
 * Each tab shows the live records when the branch has any, and hardcoded sample records (branch-demo.data)
 * while it has none, flagged with a "Sample data" note.
 */
@Component({
  selector: 'app-branch-details',
  standalone: true,
  imports: [CommonModule, RouterLink, MatDialogModule, BfDonut, BfBars, BfColumns, HScroll],
  templateUrl: './branch-details.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise.scss'],
})
export class BranchDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly acc = inject(AccountsService);
  private readonly crm = inject(CrmFlowService);
  protected readonly store = inject(BranchService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly branch = computed(() => this.store.branch(this.id()));
  readonly tab = signal<Tab>(this.initialTab());
  readonly period = signal<Period>('month');
  readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'bi-grid-1x2-fill' }, { key: 'employees', label: 'Employees', icon: 'bi-people-fill' },
    { key: 'attendance', label: 'Attendance', icon: 'bi-person-check-fill' }, { key: 'leads', label: 'Leads', icon: 'bi-person-lines-fill' },
    { key: 'customers', label: 'Customers', icon: 'bi-person-heart' }, { key: 'appointments', label: 'Appointments', icon: 'bi-calendar2-check-fill' },
    { key: 'treatments', label: 'Treatments', icon: 'bi-heart-pulse-fill' }, { key: 'sales', label: 'Sales', icon: 'bi-graph-up-arrow' },
    { key: 'inventory', label: 'Inventory', icon: 'bi-box-seam-fill' }, { key: 'expenses', label: 'Expenses', icon: 'bi-wallet2' },
    { key: 'feedback', label: 'Feedback', icon: 'bi-star-fill' }, 
    // { key: 'documents', label: 'Documents', icon: 'bi-file-earmark-text-fill' },
    { key: 'reports', label: 'Reports', icon: 'bi-bar-chart-line-fill' },
  ];
  private readonly tabDesc: Record<Tab, string> = {
    overview: 'Whole-branch snapshot: targets, receivables, people and revenue.',
    employees: 'Team strength, roles and employment status.',
    attendance: 'Who is in, late or away today.',
    leads: 'Lead volume, treatment demand and how many convert.',
    customers: 'Who visits, what they buy and how much they spend.',
    appointments: 'Bookings by treatment, staff and payment status.',
    treatments: 'Services offered here, with sessions and revenue.',
    sales: 'Target, collections and what sold - by treatment and product.',
    inventory: 'Stock in hand, product by product.',
    expenses: 'Where the branch money goes.',
    feedback: 'What customers say about this branch.',
    documents: 'Licences, agreements and renewal dates.',
    reports: 'Branch performance by day, month and year.',
  };
  readonly activeTab = computed(() => ({ ...this.tabs.find(t => t.key === this.tab())!, desc: this.tabDesc[this.tab()] }));
  readonly periods: { key: Period; label: string }[] = [{ key: 'day', label: 'Day' }, { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }];

  readonly inr = inr;
  readonly inrShort = inrShort;
  readonly axisShort = axisShort;
  readonly initials = initials;
  readonly displayDate = displayDate;
  readonly stars = (rating: number) => { const n = Math.min(5, Math.max(0, Math.round(rating))); return '★'.repeat(n) + '☆'.repeat(5 - n); };

  private readonly name = computed(() => this.branch()?.name ?? '');
  readonly employees = computed(() => (this.name() ? this.store.employees(this.name()) : []));
  readonly monthlySales = computed(() => (this.name() ? this.store.sales(this.name(), isoDate().slice(0, 7)) : 0));
  readonly inventoryValue = computed(() => (this.name() ? this.store.inventoryValue(this.name()) : 0));
  readonly activities = computed(() => (this.name() ? this.store.activities(this.name()) : []));
  readonly receivables = computed(() => (this.name() ? this.store.receivables(this.name()) : 0));

  /** Hardcoded sample records, used tab by tab while the live store is empty. */
  private readonly demo = computed(() => branchDemo(this.name(), this.employees().map(e => ({ name: e.name, designation: e.designation }))));

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

  // ---- Billing (service bills of this branch) ----
  private readonly bills = computed(() => (this.name() ? this.acc.bills().filter(b => b.branch === this.name() && b.kind === 'Service' && b.status !== 'Cancelled') : []));

  private readonly liveCustomers = computed<CustomerRow[]>(() => {
    const byName = new Map<string, CustomerRow>();
    for (const bill of this.bills()) {
      const key = bill.customerName.toLowerCase();
      const row = byName.get(key) ?? { name: bill.customerName, phone: bill.customerPhone, bills: 0, billed: 0, last: '' };
      row.bills++;
      row.billed += billTotals(bill.items).grandTotal;
      if (bill.date > row.last) row.last = bill.date;
      byName.set(key, row);
    }
    return [...byName.values()].sort((a, c) => c.last.localeCompare(a.last));
  });

  readonly sales = computed(() => {
    const name = this.name();
    return name ? this.acc.vouchers().filter(v => v.branch === name && (v.type === 'Sales' || v.type === 'Receipt')).sort((a, c) => c.date.localeCompare(a.date) || c.createdAt.localeCompare(a.createdAt)).slice(0, 15) : [];
  });

  // ---- Which tabs are showing sample records ----
  readonly sample = computed(() => ({
    leads: !this.liveLeads().length && !this.liveAppointments().length,
    appointments: !this.liveAppointments().length,
    customers: !this.liveCustomers().length,
    sales: this.store.monthlySeries(this.name()).filter(m => m.sales > 0).length < 3,
    inventory: !this.store.stock(this.name()).length,
    reports: this.store.monthlySeries(this.name(), 12).filter(m => m.sales > 0).length < 3,
  }));

  // ---- Sales vs target (last 7 months) ----
  readonly series = computed(() => (this.sample().sales ? this.demo().monthly : this.store.monthlySeries(this.name())));
  readonly hasTarget = computed(() => this.series().some(m => m.target > 0));
  readonly ticks = computed(() => chartTicks(Math.max(...this.series().map(m => Math.max(m.sales, m.target)), 0)));
  readonly bars = computed(() => {
    const top = this.ticks()[this.ticks().length - 1] || 1;
    return this.series().map(m => ({ ...m, salesH: (m.sales / top) * 100, targetH: (m.target / top) * 100 }));
  });
  readonly salesVsTarget = computed<BfColumnDatum[]>(() => this.series().map(m => ({ label: m.label, a: m.sales, b: m.target })));

  /** This month's row of the series: sales, target and how far along the branch is. */
  readonly current = computed(() => {
    const m = this.series().at(-1);
    const sales = m?.sales ?? 0;
    const target = m?.target ?? 0;
    return { sales, target, percent: pct(sales, target), balance: Math.max(target - sales, 0) };
  });

  // ---- Employees ----
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
    if (this.sample().leads) return this.demo().leads.map(l => ({ ...l, followUp: l.followUp, converted: l.status === 'Appointment' }));
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
  /** Per treatment: total leads with the converted share as the inner bar. */
  readonly conversionByTreatment = computed<BfBarDatum[]>(() => {
    const total = new Map<string, number>();
    const conv = new Map<string, number>();
    for (const l of this.leadRows()) { bump(total, l.treatment); if (l.converted) bump(conv, l.treatment); }
    return topGroups(total).map(d => ({ ...d, secondary: conv.get(d.label) ?? 0 }));
  });

  // ---- Customers ----
  readonly customers = computed<CustomerRow[]>(() => (this.sample().customers ? this.demo().customers : this.liveCustomers()));
  readonly customerStats = computed(() => {
    const list = this.customers();
    const billed = list.reduce((s, c) => s + c.billed, 0);
    return { total: list.length, repeat: list.filter(c => c.bills > 1).length, billed, average: list.length ? billed / list.length : 0 };
  });
  readonly customersByTreatment = computed<BfDatum[]>(() => {
    if (this.sample().customers) {
      const m = new Map<string, number>();
      this.demo().customers.forEach(c => bump(m, c.treatment));
      return topGroups(m);
    }
    const sets = new Map<string, Set<string>>();
    for (const b of this.bills()) for (const i of b.items.filter(isService)) {
      const set = sets.get(i.description) ?? new Set<string>();
      set.add(b.customerName.toLowerCase());
      sets.set(i.description, set);
    }
    return topGroups(new Map([...sets].map(([k, v]) => [k, v.size])));
  });
  readonly revenueByTreatment = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    if (this.sample().customers) { this.demo().treatments.forEach(t => bump(m, t.name, t.revenue)); return topGroups(m); }
    for (const b of this.bills()) for (const i of b.items.filter(isService)) bump(m, i.description, lineAmount(i).taxable);
    return topGroups(m);
  });

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
    const best = list[0];
    return { count: list.length, sessions: list.reduce((s, t) => s + t.sessions, 0), revenue: list.reduce((s, t) => s + t.revenue, 0), best: best?.name ?? '-' };
  });
  readonly treatmentsByCategory = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    this.treatments().forEach(t => bump(m, t.category, t.revenue));
    return topGroups(m);
  });
  readonly treatmentSessions = computed<BfDatum[]>(() => this.treatments().slice().sort((a, b) => b.sessions - a.sessions).slice(0, 7).map(t => ({ label: t.name, value: t.sessions })));

  // ---- Sales ----
  readonly productSales = computed<BfDatum[]>(() => {
    const m = new Map<string, number>();
    for (const b of this.bills()) for (const i of b.items.filter(x => !isService(x))) bump(m, i.description, lineAmount(i).taxable);
    return m.size ? topGroups(m) : this.demo().products.map(p => ({ label: p.name, value: p.amount })).sort((a, b) => b.value - a.value);
  });
  readonly billedTotal = computed(() => (this.sample().customers ? this.customers().reduce((s, c) => s + c.billed, 0) : this.bills().reduce((s, b) => s + billTotals(b.items).grandTotal, 0)));

  // ---- Inventory ----
  readonly stockByProduct = computed(() => {
    if (this.sample().inventory) return this.demo().stock.map(s => ({ name: s.name, code: s.code, qty: s.qty, value: s.qty * s.unitPrice, batches: s.batches })).sort((a, b) => b.value - a.value);
    const m = new Map<string, { name: string; code: string; qty: number; value: number; batches: number }>();
    for (const s of this.store.stock(this.name())) {
      const row = m.get(s.productId) ?? { name: s.productName, code: s.productCode, qty: 0, value: 0, batches: 0 };
      row.qty += s.qty;
      row.value += s.qty * s.unitPrice;
      row.batches++;
      m.set(s.productId, row);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  });
  readonly stockTotal = computed(() => this.stockByProduct().reduce((s, p) => s + p.value, 0));
  readonly stockStats = computed(() => {
    const soon = addDays(isoDate(), 60);
    const today = isoDate();
    const live = this.store.stock(this.name());
    return {
      products: this.stockByProduct().length,
      units: this.stockByProduct().reduce((s, p) => s + p.qty, 0),
      expiring: this.sample().inventory ? this.demo().stock.reduce((s, p) => s + p.expiring, 0) : live.filter(b => b.expiryDate && b.expiryDate >= today && b.expiryDate <= soon).length,
    };
  });
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
    const name = this.name();
    if (!name) return [];
    if (this.sample().reports) return this.demo().periods[this.period()];
    return this.periodKeys().map(p => ({
      ...p,
      sales: this.store.sales(name, p.key),
      bills: this.bills().filter(b => b.date.startsWith(p.key)).length,
      appointments: this.liveAppointments().filter(a => (a.date ?? '').startsWith(p.key)).length,
    }));
  });
  readonly reportSales = computed<BfColumnDatum[]>(() => this.report().map(r => ({ label: r.label, a: r.sales })));
  readonly reportActivity = computed<BfColumnDatum[]>(() => this.report().map(r => ({ label: r.label, a: r.bills, b: r.appointments })));
  readonly reportTotals = computed(() => {
    const r = this.report();
    return { sales: r.reduce((s, x) => s + x.sales, 0), bills: r.reduce((s, x) => s + x.bills, 0), appointments: r.reduce((s, x) => s + x.appointments, 0) };
  });
  /** Whole-branch process: how far leads travel before they turn into paid revenue. */
  readonly funnel = computed<BfBarDatum[]>(() => {
    const leads = this.leadStats().total;
    const appts = this.appointmentRows().length;
    const billed = this.sample().customers ? this.customers().reduce((s, c) => s + c.bills, 0) : this.bills().length;
    const paid = this.sample().customers ? Math.round(billed * 0.8) : this.bills().filter(b => b.status === 'Paid').length;
    return [{ label: 'Leads', value: leads }, { label: 'Appointments', value: appts }, { label: 'Bills raised', value: billed }, { label: 'Bills paid', value: paid }];
  });

  achievement(sales: number, target: number): string {
    return target ? `${Math.round((sales / target) * 100)}%` : '-';
  }

  amount(voucher: { entries: { debit: number }[] }): number {
    return voucher.entries.reduce((s, e) => s + e.debit, 0);
  }

  /** `?tab=customers` (used by the list page's quick actions) opens that tab straight away. */
  private initialTab(): Tab {
    const wanted = this.route.snapshot.queryParamMap.get('tab');
    const valid: Tab[] = ['overview', 'employees', 'attendance', 'leads', 'customers', 'appointments', 'treatments', 'sales', 'inventory', 'expenses', 'feedback', 'documents', 'reports'];
    return valid.find(t => t === wanted) ?? 'overview';
  }

  edit(): void {
    if (!this.branch()) return;
    this.dialog.open(BranchForm, { width: '860px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { branchId: this.branch()!.id } });
  }

  back(): void {
    this.router.navigate(['/app/branches']);
  }
}
