import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { FranchiseService } from '../../../shared/common-services/franchise.service';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { LocalListBase } from '../../../shared/components/local-list-base';
import { DetailCardData, ExportFormat, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { inrShort, invoiceTotal, lastMonths } from '../../../shared/models/branch-franchise.model';
import { displayDate } from '../../../shared/utils/format.util';
import { FranchiseForm } from '../franchise-form/franchise-form';

/** Franchise Management: partner outlets with their sales and the Renew company share. */
@Component({
  selector: 'app-franchises',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './franchises.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise-list.scss'],
})
export class Franchises extends LocalListBase {
  private readonly store = inject(FranchiseService);
  private readonly router = inject(Router);

  protected readonly noun = 'franchises';
  protected override filterFields = { status: 'status', source: 'city', branch: ['name'] };

  override filters = [
    { key: 'status', label: 'Status', options: ['Active', 'Pending', 'Inactive'] },
    { key: 'source', label: 'City', options: [...new Set(this.store.franchises().map(f => f.city))].sort() },
  ];

  columns: TableColumn[] = [
    { key: 'code', header: 'Code', width: '7%' },
    { key: 'franchiseName', header: 'Franchise Name', type: 'lead', width: '15%' },
    { key: 'owner', header: 'Owner Name', width: '14%' },
    { key: 'city', header: 'City', width: '9%' },
    { key: 'state', header: 'State', width: '9%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'sales', header: 'Total Sales', width: '11%' },
    { key: 'renew', header: 'Renew Share', width: '11%' },
    { key: 'actions', header: 'Actions', type: 'quickActions', width: '8%', sortable: false },
  ];

  override sortActive = 'code';
  override sortDirection: 'asc' | 'desc' = 'asc';

  /** Franchise shown in the details panel; falls back to the first row on screen. */
  readonly selectedId = signal<string | null>(null);
  /** The details panel slides in over the page when a row is clicked. */
  readonly panelOpen = signal(false);
  /** Tabs after Overview open the matching tab on the full details page. */
  readonly panelTabs = ['agreement', 'employees', 'sales'] as const;
  readonly displayDate = displayDate;

  current() {
    const all = this.store.franchises();
    return all.find(f => f.id === this.selectedId());
  }

  panel() {
    const f = this.current();
    if (!f) return null;
    const t = this.store.totalsFor(f.id);
    const share = f.sharePercent;
    return { franchise: f, totals: t, franchiseShare: share, renewShare: 100 - share, donut: `conic-gradient(var(--status-blue-text) 0 ${share}%, var(--status-green-text) ${share}% 100%)` };
  }

  select(row: TableRow): void {
    this.selectedId.set(String(row['id']));
    this.panelOpen.set(true);
  }

  @HostListener('document:keydown.escape')
  closePanel(): void {
    this.panelOpen.set(false);
  }

  panelLink(id: string, tab: string): void {
    this.router.navigate(['/app/franchises', id], { queryParams: { tab } });
  }

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.store.franchises();
    const overall = this.store.overall();
    // Month-on-month growth of invoice value across all franchises.
    const [prev, current] = lastMonths(2).map(m => this.store.invoices().filter(i => i.date.startsWith(m.key)).reduce((s, i) => s + invoiceTotal(i.items), 0));
    const growth = prev ? Math.round(((current - prev) / prev) * 100) : null;
    return [
      { label: 'Total Franchises', value: list.length, icon: 'bi-shop', iconVariant: 'blue' },
      { label: 'Active Franchises', value: list.filter(f => f.status === 'Active').length, icon: 'bi-check-circle-fill', iconVariant: 'green' },
      { label: 'Pending', value: list.filter(f => f.status === 'Pending').length, icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Total Sales', value: inrShort(overall.total), trendText: growth === null ? undefined : `${growth >= 0 ? '+' : ''}${growth}% growth`, trendDirection: growth !== null && growth < 0 ? 'down' : 'up', icon: 'bi-graph-up-arrow', iconVariant: 'blue' },
      { label: 'Renew Share (Company)', value: inrShort(overall.renew), trendText: `${overall.renewPercent}% of total`, trendDirection: 'neutral', icon: 'bi-percent', iconVariant: 'purple' },
    ];
  });

  protected allRows(): TableRow[] {
    return this.store.franchises().map(f => {
      const t = this.store.totalsFor(f.id);
      return {
        id: f.id,
        code: f.code,
        franchiseName: { name: f.name, subtitle: f.ownerCompany, photo: f.photo },
        __franchiseName: f.name,
        searchText: `${f.name} ${f.ownerCompany} ${f.ownerName} ${f.city} ${f.code}`,
        name: f.name,
        owner: f.ownerCompany,
        city: f.city,
        state: f.state,
        status: f.status,
        sales: `₹${Math.round(t.total).toLocaleString('en-IN')}`, __sales: t.total,
        renew: `₹${Math.round(t.renew).toLocaleString('en-IN')}`, __renew: t.renew,
        actions: [
          { key: 'edit', icon: 'bi-pencil-square', label: 'Edit franchise', variant: 'primary' },
          { key: 'view', icon: 'bi-eye-fill', label: 'View franchise details' },
        ],
      };
    });
  }

  addFranchise(): void {
    this.openDialog(FranchiseForm, {}, '860px');
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    this.selectedId.set(String(event.row['id']));
    if (event.action === 'view') this.router.navigate(['/app/franchises', event.row['id']]);
    if (event.action === 'edit') {
      this.closePanel();
      this.openDialog(FranchiseForm, { franchiseId: event.row['id'] }, '860px');
    }
  }

  open(row: TableRow): void {
    this.router.navigate(['/app/franchises', row['id']]);
  }

  onExport(format: ExportFormat): void {
    this.exportAs(format, 'franchises', 'Franchises');
  }
}
