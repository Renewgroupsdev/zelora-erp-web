import { GeoLocationCard } from '../../../shared/components/geo-location-card/geo-location-card';
import { CommonModule } from '@angular/common';
import { PageLoader } from '../../../shared/components/page-loader/page-loader';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { finalize, map } from 'rxjs';
import { FranchiseInvoiceRow, FranchiseService, FranchiseSeriesPoint, FranchiseSummary } from '../../../shared/common-services/franchise.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { BfBars } from '../../../shared/components/bf-charts/bf-bars/bf-bars';
import { BfBarDatum, BfColumnDatum, BfDatum } from '../../../shared/components/bf-charts/bf-charts.model';
import { BfColumns } from '../../../shared/components/bf-charts/bf-columns/bf-columns';
import { BfDonut } from '../../../shared/components/bf-charts/bf-donut/bf-donut';
import { FranchiseRecord, inrShort } from '../../../shared/models/branch-franchise.model';
import { HScroll } from '../../../shared/directives/h-scroll';
import { daysBetween, displayDate, initials, inr, isoDate } from '../../../shared/utils/format.util';
import { FranchiseForm } from '../franchise-form/franchise-form';
import { FranchiseInvoiceForm } from '../franchise-invoice-form/franchise-invoice-form';

type Tab = 'overview' | 'agreement' | 'customers' | 'sales' | 'inventory' | 'reports';
type Period = 'day' | 'month' | 'year';

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Largest `n` groups by value; everything else is rolled into "Others". */
function topGroups(rows: BfDatum[], n = 6): BfDatum[] {
  const sorted = rows.filter(r => r.value > 0).sort((a, b) => b.value - a.value);
  const rest = sorted.slice(n).reduce((s, r) => s + r.value, 0);
  return rest ? [...sorted.slice(0, n), { label: 'Others', value: rest }] : sorted.slice(0, n);
}

/**
 * One franchise partner: owner, agreement, revenue share and the sales / customers / reports built from the invoices
 * the partner raised. Every figure comes from the API (GET /franchises/{id} and GET /franchises/{id}/{tab}).
 */
@Component({
  selector: 'app-franchise-details',
  standalone: true,
  imports: [CommonModule, RouterLink, MatDialogModule, PageLoader, HScroll, BfDonut, BfBars, BfColumns, GeoLocationCard, CanActionDirective],
  templateUrl: './franchise-details.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise.scss'],
})
export class FranchiseDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(FranchiseService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly franchise = computed<FranchiseRecord | undefined>(() => this.store.franchise(this.id()));
  readonly summary = signal<FranchiseSummary | null>(null);
  readonly loading = signal(true);
  readonly tabLoading = signal(false);
  readonly tab = signal<Tab>(this.initialTab());
  readonly period = signal<Period>('month');

  readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'bi-grid-1x2-fill' },
     { key: 'agreement', label: 'Agreement', icon: 'bi-file-earmark-check-fill' },
    { key: 'customers', label: 'Customers', icon: 'bi-person-heart' },
     { key: 'sales', label: 'Sales', icon: 'bi-graph-up-arrow' },
    { key: 'inventory', label: 'Inventory', icon: 'bi-box-seam-fill' }, 
    { key: 'reports', label: 'Reports', icon: 'bi-bar-chart-line-fill' },
  ];
  readonly periods: { key: Period; label: string }[] = [{ key: 'day', label: 'Day' }, { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }];

  readonly inr = inr;
  readonly inrShort = inrShort;
  readonly initials = initials;
  readonly displayDate = displayDate;

  private readonly salesData = signal<any>(null);
  private readonly customerData = signal<any>(null);
  private readonly inventoryData = signal<any>(null);
  private readonly reportData = signal<any>(null);
  readonly invoices = signal<FranchiseInvoiceRow[]>([]);
  readonly invoiceTotals = signal({ invoices: 0, total: 0, franchise: 0, renew: 0 });

  constructor() {
    // Load the franchise whenever the route id changes, then its first tab.
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

  /** Fetches the data of the open tab (overview and agreement come with the franchise itself). */
  private loadTab(): void {
    const id = this.id();
    const tab = this.tab();
    if (!id || tab === 'overview' || tab === 'agreement') return;
    this.tabLoading.set(true);
    const done = () => this.tabLoading.set(false);
    const fail = (err: any) => { done(); this.toast.error(err?.error?.message || 'Failed to load this tab. Please try again.'); };

    if (tab === 'sales') this.store.invoices(id).subscribe({ next: r => { this.invoices.set(r.invoices); this.invoiceTotals.set(r.totals); }, error: fail });
    const target = ({ sales: this.salesData, customers: this.customerData, inventory: this.inventoryData, reports: this.reportData } as const)[tab];
    this.store.tab(id, tab, tab === 'reports' ? { period: this.period() } : {}).subscribe({ next: data => { target.set(data); done(); }, error: fail });
  }

  // ---- Overview ----
  readonly totals = computed(() => this.summary()?.totals ?? { total: 0, franchise: 0, renew: 0, invoices: 0, paid: 0 });
  readonly monthSales = computed(() => this.summary()?.monthSales ?? 0);
  readonly unpaid = computed(() => this.summary()?.unpaid ?? 0);
  readonly recentInvoices = computed(() => this.summary()?.recentInvoices ?? []);
  readonly salesSeries = computed<BfColumnDatum[]>(() => (this.summary()?.monthlySeries ?? []).map((m: FranchiseSeriesPoint) => ({ label: m.label, a: m.sales })));
  readonly overviewProducts = computed<BfDatum[]>(() => topGroups((this.summary()?.byProduct ?? []).map(p => ({ ...p }))));
  readonly overviewShare = computed<BfDatum[]>(() => this.summary()?.shareSplit ?? []);
  readonly overviewFunnel = computed<BfBarDatum[]>(() => [
    { label: 'Invoices raised', value: this.totals().invoices },
    { label: 'Invoices paid', value: this.totals().paid },
  ]);

  // ---- Agreement ----
  readonly agreement = computed(() => {
    const f = this.franchise();
    if (!f || !f.agreementFrom || !f.agreementTo) return null;
    const today = isoDate();
    const total = Math.max(1, daysBetween(f.agreementFrom, f.agreementTo));
    const used = Math.min(total, Math.max(0, daysBetween(f.agreementFrom, today)));
    const left = Math.max(0, daysBetween(today, f.agreementTo));
    const state = today < f.agreementFrom ? 'Not started' : today > f.agreementTo ? 'Expired' : left <= 90 ? 'Renew soon' : 'Running';
    return { total, used, left, percent: pct(used, total), years: (total / 365).toFixed(1), state };
  });
  readonly agreementShare = computed<BfDatum[]>(() => {
    const share = this.franchise()?.sharePercent ?? 0;
    return [{ label: `Franchise (${share}%)`, value: share }, { label: `Renew (${Math.round((100 - share) * 100) / 100}%)`, value: 100 - share }];
  });

  // ---- Customers ----
  readonly customers = computed<any[]>(() => this.customerData()?.rows ?? []);
  readonly customerStats = computed(() => this.customerData()?.stats ?? { total: 0, repeat: 0, billed: 0, average: 0 });
  readonly customersByProduct = computed<BfDatum[]>(() => topGroups(this.customerData()?.customers_by_product ?? []));
  readonly customerRevenue = computed<BfDatum[]>(() => topGroups(this.customerData()?.revenue_by_product ?? []));

  // ---- Sales ----
  readonly salesStats = computed(() => this.salesData()?.stats ?? { this_month: 0, last_month: 0, total: 0, unpaid: 0, franchise_share: 0, renew_share: 0 });
  readonly salesColumns = computed<BfColumnDatum[]>(() => (this.salesData()?.series ?? []).map((m: FranchiseSeriesPoint) => ({ label: m.label, a: m.sales })));
  readonly shareSplit = computed<BfDatum[]>(() => this.salesData()?.share_split ?? []);
  readonly productSales = computed<BfDatum[]>(() => topGroups(this.salesData()?.by_product ?? []));

  // ---- Inventory (stock value reported by the partner) ----
  readonly stockValue = computed(() => this.inventoryData()?.inventory_value ?? this.franchise()?.inventoryValue ?? 0);
  readonly staffCount = computed(() => this.inventoryData()?.employees ?? this.franchise()?.employees ?? 0);

  // ---- Reports: day / month / year ----
  readonly report = computed<FranchiseSeriesPoint[]>(() => this.reportData()?.rows ?? []);
  readonly reportTotals = computed(() => this.reportData()?.totals ?? { sales: 0, invoices: 0, franchise: 0, renew: 0 });
  readonly reportSales = computed<BfColumnDatum[]>(() => this.report().map(r => ({ label: r.label, a: r.sales })));
  readonly reportShare = computed<BfColumnDatum[]>(() => this.report().map(r => ({ label: r.label, a: r.franchise, b: r.renew })));
  readonly reportFunnel = computed<BfBarDatum[]>(() => this.reportData()?.funnel ?? []);

  // ---- Invoice actions ----
  addInvoice(): void {
    const f = this.franchise();
    if (!f) return;
    this.dialog.open(FranchiseInvoiceForm, {
      width: '780px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true,
      data: { franchiseId: f.id, franchiseName: f.name, sharePercent: f.sharePercent },
    }).afterClosed().subscribe(invoice => invoice && this.refreshAfterInvoiceChange('Invoice ' + invoice.invoiceNo + ' raised'));
  }

  togglePaid(invoice: FranchiseInvoiceRow): void {
    this.store.setInvoiceStatus(this.id(), invoice.id, invoice.status === 'Paid' ? 'Unpaid' : 'Paid').subscribe({
      next: updated => this.refreshAfterInvoiceChange(`Invoice ${updated.invoiceNo} marked ${updated.status}`),
      error: (err: any) => this.toast.error(err?.error?.message || 'Could not update the invoice.'),
    });
  }

  async cancelInvoice(invoice: FranchiseInvoiceRow): Promise<void> {
    if (!(await this.toast.confirm('Cancel this invoice?', `${invoice.invoiceNo} for ${invoice.customer} will be removed from the sales.`))) return;
    this.store.cancelInvoice(this.id(), invoice.id).subscribe({
      next: () => this.refreshAfterInvoiceChange('Invoice cancelled'),
      error: (err: any) => this.toast.error(err?.error?.message || 'Could not cancel the invoice.'),
    });
  }

  private refreshAfterInvoiceChange(message: string): void {
    this.toast.success(message);
    this.refreshSummary();
    this.loadTab();
  }

  /** `?tab=sales` (used by the list page's quick actions) opens that tab straight away. */
  private initialTab(): Tab {
    const wanted = this.route.snapshot.queryParamMap.get('tab');
    const valid: Tab[] = ['overview', 'agreement', 'customers', 'sales', 'inventory', 'reports'];
    return valid.find(t => t === wanted) ?? 'overview';
  }

  /** Re-reads the header / overview after a change, behind the page loader. */
  private refreshSummary(): void {
    this.loading.set(true);
    this.store.fetch(this.id()).pipe(finalize(() => this.loading.set(false))).subscribe(res => this.summary.set(res.summary));
  }

  edit(): void {
    if (!this.franchise()) return;
    this.dialog.open(FranchiseForm, { width: '860px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { franchiseId: this.franchise()!.id } })
      .afterClosed().subscribe(saved => saved && this.refreshSummary());
  }

  back(): void {
    this.router.navigate(['/app/franchises']);
  }
}
