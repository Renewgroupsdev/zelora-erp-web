import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { Router } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { BranchService } from '../../../shared/common-services/branch.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { LocalListBase } from '../../../shared/components/local-list-base';
import { DetailCardData, ExportFormat, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { inrShort } from '../../../shared/models/branch-franchise.model';
import { saveBlob } from '../../../shared/utils/export.util';
import { displayDate, initials } from '../../../shared/utils/format.util';
import { BranchForm } from '../branch-form/branch-form';

/** Branch Management: every company owned branch with its head, customers and monthly sales. */
@Component({
  selector: 'app-branches',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, CanActionDirective],
  templateUrl: './branches.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise-list.scss'],
})
export class Branches extends LocalListBase implements OnInit {
  private readonly store = inject(BranchService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Roles & Permissions: whether the signed-in role is ticked on this action slug. */
  can(slug: string): boolean {
    return this.auth.hasActionAccess(slug);
  }

  protected readonly noun = 'branches';
  protected override filterFields = { status: 'status', source: 'city', branch: ['name'] };

  override filters = [
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
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
        this.filters = [this.filters[0], { key: 'source', label: 'City', options: [...new Set(list.map(b => b.city).filter(Boolean))].sort() }];
      },
      error: (err: any) => this.toast.error(err?.error?.message || 'Failed to load branches. Please try again.'),
    });
  }

  columns: TableColumn[] = [
    { key: 'code', header: 'Code', width: '7%' },
    { key: 'branchName', header: 'Branch Name', type: 'lead', width: '16%' },
    { key: 'head', header: 'Branch Head', width: '13%' },
    { key: 'city', header: 'City', width: '10%' },
    { key: 'state', header: 'State', width: '10%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'customers', header: 'Total Customers', width: '11%' },
    { key: 'sales', header: 'Monthly Sales', width: '12%' },
    { key: 'actions', header: 'Actions', type: 'quickActions', width: '8%', sortable: false },
  ];

  override sortActive = 'code';
  override sortDirection: 'asc' | 'desc' = 'asc';

  /** Branch shown in the details panel; falls back to the first row on screen. */
  readonly selectedId = signal<string | null>(null);
  /** The details panel slides in over the page when a row is clicked. */
  readonly panelOpen = signal(false);
  /** Tabs after Overview open the matching tab on the full details page. */
  readonly panelTabs = ['employees', 'customers', 'sales', 'inventory'] as const;
  readonly initials = initials;
  readonly displayDate = displayDate;

  current() {
    const all = this.store.branches();
    return all.find(b => b.id === this.selectedId());
  }

  panel() {
    const b = this.current();
    if (!b) return null;
    return { branch: b, customers: b.customers ?? 0, employees: b.employees ?? 0, sales: b.monthlySales ?? 0 };
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
    this.router.navigate(['/app/branches', id], { queryParams: { tab } });
  }

  readonly stats = computed<DetailCardData[]>(() => {
    const o = this.store.stats();
    const growth = o?.salesGrowthPercent ?? null;
    return [
      { label: 'Total Branches', value: o?.totalBranches ?? 0, trendText: `+${o?.newBranches ?? 0} this month`, trendDirection: o?.newBranches ? 'up' : 'neutral', icon: 'bi-building', iconVariant: 'blue' },
      { label: 'Active Branches', value: o?.activeBranches ?? 0, trendText: `${o?.activePercent ?? 0}% active`, trendDirection: 'neutral', icon: 'bi-check-circle-fill', iconVariant: 'green' },
      { label: 'Total Employees', value: o?.totalEmployees ?? 0, trendText: `+${o?.newEmployees ?? 0} this month`, trendDirection: o?.newEmployees ? 'up' : 'neutral', icon: 'bi-people-fill', iconVariant: 'purple' },
      { label: 'Monthly Sales', value: inrShort(o?.monthlySales ?? 0), trendText: growth === null ? 'This month' : `${growth >= 0 ? '+' : ''}${growth}% growth`, trendDirection: growth !== null && growth < 0 ? 'down' : 'up', icon: 'bi-graph-up-arrow', iconVariant: 'orange' },
    ];
  });

  protected allRows(): TableRow[] {
    return this.store.branches().map(b => {
      const customers = b.customers ?? 0;
      const sales = b.monthlySales ?? 0;
      return {
        id: b.id,
        code: b.code,
        branchName: { name: b.name, subtitle: b.phone, photo: b.photo },
        __branchName: b.name,
        searchText: `${b.name} ${b.headName} ${b.city} ${b.code}`,
        name: b.name,
        head: b.headName,
        city: b.city,
        state: b.state,
        status: b.status,
        customers: String(customers), __customers: customers,
        sales: `₹${Math.round(sales).toLocaleString('en-IN')}`, __sales: sales,
        actions: [
          { key: 'edit', icon: 'bi-pencil-square', label: 'Edit branch', variant: 'primary' },
          { key: 'view', icon: 'bi-eye-fill', label: 'View branch details' },
          { key: 'employees', icon: 'bi-people-fill', label: 'Branch employees' },
          { key: 'delete', icon: 'bi-trash3-fill', label: 'Delete branch', variant: 'danger', permission: 'delete-branch' },
        ],
      };
    });
  }

  addBranch(): void {
    this.openDialog(BranchForm, {}, '860px').afterClosed().subscribe(saved => saved && this.reload());
  }

  private async deleteBranch(row: TableRow): Promise<void> {
    const name = (row['__branchName'] as string) || 'This branch';
    if (!(await this.toast.confirm('Delete this branch?', `${name} will be removed. Branches that still have staff or customers cannot be deleted - mark them Inactive instead.`))) return;
    this.store.remove(String(row['id'])).subscribe({
      next: () => { this.closePanel(); this.toast.success('Branch deleted successfully'); },
      error: (err: any) => this.toast.error(err?.error?.message || 'Failed to delete branch. Please try again.'),
    });
  }

  open(row: TableRow): void {
    this.router.navigate(['/app/branches', row['id']]);
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    if (event.action === 'delete') return void this.deleteBranch(event.row);
    this.selectedId.set(String(event.row['id']));
    if (event.action === 'view') this.open(event.row);
    if (event.action === 'edit') {
      this.closePanel();
      this.openDialog(BranchForm, { branchId: event.row['id'] }, '860px').afterClosed().subscribe(saved => saved && this.reload());
    }
    if (event.action === 'employees') this.router.navigate(['/app/branches', event.row['id'], 'employees']);
  }

  /** Server export of the branches matching the search and filters; falls back to the table's own rows if the server cannot build the file. */
  onExport(format: ExportFormat): void {
    const f = this.filterState;
    this.store.export(format, { search: this.searchTerm, status: f.status, cities: f.source ? [f.source] : [] }).subscribe({
      next: blob => saveBlob(blob, `branches-${new Date().toISOString().slice(0, 10)}.${format}`),
      error: () => this.exportAs(format, 'branches', 'Branches'),
    });
  }
}
