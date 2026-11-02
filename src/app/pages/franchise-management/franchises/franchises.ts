import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { Router } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { GeoLocationCard } from '../../../shared/components/geo-location-card/geo-location-card';
import { FranchiseService } from '../../../shared/common-services/franchise.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { LocalListBase } from '../../../shared/components/local-list-base';
import { DetailCardData, ExportFormat, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { inrShort } from '../../../shared/models/branch-franchise.model';
import { saveBlob } from '../../../shared/utils/export.util';
import { displayDate } from '../../../shared/utils/format.util';
import { FranchiseForm } from '../franchise-form/franchise-form';
import { AutoModuleTabs } from '../../../shared/components/module-tabs/auto-module-tabs';

/** Franchise Management: partner outlets with their sales and the Renew company share. */
@Component({
  selector: 'app-franchises',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, CanActionDirective, GeoLocationCard],
  templateUrl: './franchises.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise-list.scss'],
})
export class Franchises extends LocalListBase implements OnInit {
  private readonly store = inject(FranchiseService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Roles & Permissions: whether the signed-in role is ticked on this action slug. */
  can(slug: string): boolean {
    return this.auth.hasActionAccess(slug);
  }

  protected readonly noun = 'franchises';
  protected override filterFields = { status: 'status', source: 'city', branch: ['name'] };

  override filters = [
    { key: 'status', label: 'Status', options: ['Active', 'Pending', 'Inactive'] },
    { key: 'source', label: 'City', options: [] as string[] },
  ];

  /** Table heartbeat loader while the list is fetched from the API. */
  readonly loading = signal(false);

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.store.load().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: list => {
        this.filters = [this.filters[0], { key: 'source', label: 'City', options: [...new Set(list.map(f => f.city).filter(Boolean))].sort() }];
      },
      error: (err: any) => this.toast.error(err?.error?.message || 'Failed to load franchises. Please try again.'),
    });
  }

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

  override sortActive = '';
  override sortDirection: 'asc' | 'desc' = 'asc';

  /** Franchise shown in the details panel; falls back to the first row on screen. */
  readonly selectedId = signal<string | null>(null);
  /** The details panel slides in over the page when a row is clicked. */
  readonly panelOpen = signal(false);
  /** Tabs after Overview open the matching tab on the full details page. */
  readonly panelTabs = ['agreement', 'customers', 'sales'] as const;
  readonly displayDate = displayDate;

  current() {
    const all = this.store.franchises();
    return all.find(f => f.id === this.selectedId());
  }

  panel() {
    const f = this.current();
    if (!f) return null;
    const share = f.sharePercent;
    const totals = { total: f.totalSales ?? 0, franchise: f.franchiseShareTotal ?? 0, renew: f.renewShareTotal ?? 0, invoices: f.invoicesCount ?? 0 };
    return { franchise: f, totals, franchiseShare: share, renewShare: Math.round((100 - share) * 100) / 100, donut: `conic-gradient(var(--status-blue-text) 0 ${share}%, var(--status-green-text) ${share}% 100%)` };
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
    const o = this.store.overview();
    const growth = o?.salesGrowthPercent ?? null;
    return [
      { label: 'Total Franchises', value: o?.totalFranchises ?? 0, icon: 'bi-shop', iconVariant: 'blue' },
      { label: 'Active Franchises', value: o?.activeFranchises ?? 0, icon: 'bi-check-circle-fill', iconVariant: 'green' },
      { label: 'Pending', value: o?.pendingFranchises ?? 0, icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Total Sales', value: inrShort(o?.totalSales ?? 0), trendText: growth === null ? undefined : `${growth >= 0 ? '+' : ''}${growth}% growth`, trendDirection: growth !== null && growth < 0 ? 'down' : 'up', icon: 'bi-graph-up-arrow', iconVariant: 'blue' },
      { label: 'Renew Share (Company)', value: inrShort(o?.renewShare ?? 0), trendText: `${o?.renewPercent ?? 0}% of total`, trendDirection: 'neutral', icon: 'bi-percent', iconVariant: 'purple' },
    ];
  });

  protected allRows(): TableRow[] {
    return this.store.franchises().map(f => {
      const total = f.totalSales ?? 0;
      const renew = f.renewShareTotal ?? 0;
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
        sales: `₹${Math.round(total).toLocaleString('en-IN')}`, __sales: total,
        renew: `₹${Math.round(renew).toLocaleString('en-IN')}`, __renew: renew,
        actions: [
          { key: 'edit', icon: 'bi-pencil-square', label: 'Edit franchise', variant: 'primary' },
          { key: 'view', icon: 'bi-eye-fill', label: 'View franchise details' },
          { key: 'delete', icon: 'bi-trash3-fill', label: 'Delete franchise', variant: 'danger', permission: 'delete-franchise' },
        ],
      };
    });
  }

  addFranchise(): void {
    this.openDialog(FranchiseForm, {}, '860px').afterClosed().subscribe(saved => saved && this.reload());
  }

  private async deleteFranchise(row: TableRow): Promise<void> {
    const name = (row['__franchiseName'] as string) || 'This franchise';
    if (!(await this.toast.confirm('Delete this franchise?', `${name} will be removed. A franchise that already has invoices cannot be deleted - mark it Inactive instead.`))) return;
    this.store.remove(String(row['id'])).subscribe({
      next: () => { this.closePanel(); this.toast.success('Franchise deleted successfully'); },
      error: (err: any) => this.toast.error(err?.error?.message || 'Failed to delete franchise. Please try again.'),
    });
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    if (event.action === 'delete') return void this.deleteFranchise(event.row);
    this.selectedId.set(String(event.row['id']));
    if (event.action === 'view') this.router.navigate(['/app/franchises', event.row['id']]);
    if (event.action === 'edit') {
      this.closePanel();
      this.openDialog(FranchiseForm, { franchiseId: event.row['id'] }, '860px').afterClosed().subscribe(saved => saved && this.reload());
    }
  }

  open(row: TableRow): void {
    this.router.navigate(['/app/franchises', row['id']]);
  }

  /** Server export of the franchises matching the search and filters; falls back to the table's own rows if the server cannot build the file. */
  onExport(format: ExportFormat): void {
    const f = this.filterState;
    this.store.export(format, { search: this.searchTerm, status: f.status, cities: f.source ? [f.source] : [] }).subscribe({
      next: blob => saveBlob(blob, `franchises-${new Date().toISOString().slice(0, 10)}.${format}`),
      error: () => this.exportAs(format, 'franchises', 'Franchises'),
    });
  }
}
