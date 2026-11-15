import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Sort, SortDirection } from '@angular/material/sort';
import { Subscription } from 'rxjs';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../shared/components/common-table-card/common-table-card';
import {
  CommonFilterState,
  DetailCardData,
  FilterOption,
  LeadCell,
  QuickAction,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '../../shared/models/common-components.model';
import { ToastService } from '../../shared/common-services/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { CanActionDirective } from '../../shared/directives/can-action.directive';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { CustomerDetailsDialog } from '../appointment-page/customer-details-dialog/customer-details-dialog';
import { SittingsDialog } from '../appointment-page/sittings-dialog/sittings-dialog';
import { EditCustomerDialog } from './edit-customer-dialog/edit-customer-dialog';
import { AddTreatmentDialog } from './add-treatment-dialog/add-treatment-dialog';
import { CustomerPaymentsDialog } from './customer-payments-dialog/customer-payments-dialog';
import { Customer, CustomerSegment, CustomerStats } from './customer.model';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'view', icon: 'bi-eye', label: 'View Profile', variant: 'primary', permission: 'view-customer', fixedIcon: true },
  { key: 'edit', icon: 'bi-pencil-square', label: 'Edit Customer', variant: 'default', permission: 'edit-customer' },
  { key: 'payments', icon: 'bi-cash-coin', label: 'Customer Payments', variant: 'default', permission: 'customer-payments', fixedIcon: true },
];

/** A converted customer (Appointments -> invoice -> customer) has a treatment plan whose sittings are worked here. */
/** Documents of a converted customer: the payment receipt and the tax invoice (Download Invoice permission). */
const RECEIPT_ACTION: QuickAction = { key: 'receipt', icon: 'bi-receipt', label: 'Payment receipt', variant: 'default', permission: 'download-invoice', fixedIcon: true, fixedLabel: true };
const INVOICE_ACTION: QuickAction = { key: 'invoice', icon: 'bi-file-earmark-pdf', label: 'Tax invoice', variant: 'default', permission: 'download-invoice', fixedIcon: true, fixedLabel: true };

const SITTINGS_ACTION: QuickAction = { key: 'sittings', icon: 'bi-calendar2-week', label: 'Treatment sittings', variant: 'default', permission: 'treatment-sittings', fixedIcon: true };

/**
 * Customer Management. The list, the stat cards and the Branch / Preferred service filter options all come from
 * the API (GET /customers, GET /customers/stats); search, filters, sorting and paging run server-side.
 * "View" opens the read-only customer details (profile, clinical exam, billing, sittings).
 */
@Component({
  selector: 'app-customer-portal-page',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, CanActionDirective],
  templateUrl: './customer-portal-page.html',
  styleUrl: './customer-portal-page.scss',
})
export class CustomerPortalPage implements OnInit {
  constructor(private dialog: MatDialog, private toast: ToastService, private api: ApiDataService, private auth: AuthService) { }

  /** Roles & Permissions: whether the signed-in role is ticked on this action slug. */
  can(slug: string): boolean {
    return this.auth.hasActionAccess(slug);
  }

  readonly segments: CustomerSegment[] = ['Regular', 'New'];

  viewMode: 'grid' | 'table' = 'table';

  // The common filter card has fixed keys: "source" carries the Segment and "telecaller" the Preferred service.
  filters: FilterOption[] = [
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
    { key: 'source', label: 'Segment', options: this.segments },
    { key: 'branch', label: 'Branch', multiSelect: true, options: [] },
    { key: 'telecaller', label: 'Preferred Service', options: [] },
    { key: 'date', label: 'Last Visit' },
  ];

  filterState: CommonFilterState = {
    status: null,
    source: null,
    branch: [],
    telecaller: null,
    dateFrom: null,
    dateTo: null,
  };

  columns: TableColumn[] = [
    { key: 'lead', header: 'Customer', type: 'lead' },
    { key: 'contact', header: 'Contact', type: 'text' },
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'totalVisits', header: 'Visits', type: 'text', width: '70px' },
    { key: 'lastVisit', header: 'Last Visit', type: 'text' },
    { key: 'totalAmount', header: 'Total Amount', type: 'text' },
    { key: 'balanceAmount', header: 'Balance Amount', type: 'text' },
    { key: 'paymentStatus', header: 'Payment Status', type: 'badge', sortable: false },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'actions', header: 'Actions', type: 'quickActions', sortable: false, width: '230px' },
  ];

  readonly pageSizeOptions = [12, 24, 48];

  /** The page of customers on screen (table and grid view share it). */
  customers: Customer[] = [];
  rows: TableRow[] = [];
  loading = false;
  stats: DetailCardData[] = this.buildStats(null);

  currentPage = 1;
  pageSize = 12;
  totalRecords = 0;
  sortActive = '';
  sortDirection: SortDirection = '';
  private searchTerm = '';

  private branchKeyByName = new Map<string, string>();
  private serviceIdByName = new Map<string, number>();
  private listSub?: Subscription;

  ngOnInit(): void {
    this.loadCustomers();
  }

  // ---------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------

  /** Stat cards + filter options arrive with the customer list (GET customers -> summary): no second request. */
  private applySummary(s: CustomerStats | undefined): void {
    if (!s) return;
    this.stats = this.buildStats(s);
    this.branchKeyByName = new Map(s.branches.map(b => [b.name, b.key]));
    this.serviceIdByName = new Map(s.services.map(t => [t.name, t.id]));
    this.filters = this.filters.map(f =>
      f.key === 'branch' ? { ...f, options: s.branches.map(b => b.name) }
        : f.key === 'telecaller' ? { ...f, options: s.services.map(t => t.name) }
          : f);
  }

  private loadCustomers(): void {
    const params = new URLSearchParams({
      page: String(this.currentPage),
      per_page: String(this.pageSize),

    });
    if (this.sortActive && this.sortDirection) {
      params.set('sort_by', this.sortActive);
      params.set('sort_dir', this.sortDirection);
    }
    if (this.searchTerm) params.set('search', this.searchTerm);
    if (this.filterState.status) params.set('status', this.filterState.status);
    if (this.filterState.source) params.set('segment', this.filterState.source);
    this.filterState.branch
      .map(name => this.branchKeyByName.get(name))
      .filter((key): key is string => !!key)
      .forEach(key => params.append('branch_id[]', key));
    const serviceId = this.filterState.telecaller ? this.serviceIdByName.get(this.filterState.telecaller) : undefined;
    if (serviceId) params.set('treatment_id', String(serviceId));
    if (this.filterState.dateFrom) params.set('date_from', this.filterState.dateFrom);
    if (this.filterState.dateTo) params.set('date_to', this.filterState.dateTo);

    this.loading = true;
    // A newer search / filter / page request supersedes one still in flight.
    this.listSub?.unsubscribe();
    this.listSub = this.api.GET(`${ApiRoutesConstants.CUSTOMERS}?${params}`).subscribe({
      next: (res: any) => {
        const page = res?.data;
        this.customers = page?.data ?? [];
        this.totalRecords = Number(page?.total ?? this.customers.length);
        this.rows = this.customers.map(c => this.mapCustomerToRow(c));
        this.loading = false;
        this.applySummary(res?.summary);
      },
      error: (err: any) => {
        this.loading = false;
        this.toast.error(err?.error?.message || 'Could not load customers.');
      },
    });
  }

  private buildStats(s: CustomerStats | null): DetailCardData[] {
    const total = s?.total ?? 0;
    const activePct = total ? Math.round(((s?.active ?? 0) / total) * 100) : 0;
    return [
      { label: 'Total Customers', value: total.toLocaleString(), trendText: 'Across all branches', trendDirection: 'neutral', icon: 'bi-people-fill', iconVariant: 'primary' },
      { label: 'New This Month', value: s?.new_this_month ?? 0, trendText: 'Recently onboarded', trendDirection: 'up', icon: 'bi-person-plus-fill', iconVariant: 'green' },
      { label: 'Active Customers', value: s?.active ?? 0, trendText: `${activePct}% of base`, trendDirection: 'up', icon: 'bi-check-circle', iconVariant: 'blue' },
      { label: 'Avg. Total Amount', value: this.formatCurrency(s?.avg_total_amount ?? 0), trendText: 'Per customer', trendDirection: 'neutral', icon: 'bi-cash-stack', iconVariant: 'orange' },
    ];
  }

  setViewMode(mode: 'grid' | 'table'): void {
    this.viewMode = mode;
  }

  // ---------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  avatarColorForName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    const slot = (hash % 5) + 1;
    return `avatar-color-${slot}`;
  }

  segmentClass(segment: string): string {
    const map: Record<string, string> = { Regular: 'badge-green', New: 'badge-gray' };
    return map[segment] ?? 'badge-gray';
  }

  statusClass(status: string): string {
    return status === 'Active' ? 'badge-green' : 'badge-gray';
  }

  formatCurrency(value: number): string {
    return `₹${Number(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  formatDate(iso: string | null): string {
    if (!iso) return '-';
    const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  // ---------------------------------------------------------------------
  // Filtering, sorting, pagination (all server-side)
  // ---------------------------------------------------------------------

  onSearch(term: string): void {
    this.searchTerm = term.trim();
    this.currentPage = 1;
    this.loadCustomers();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.loadCustomers();
  }

  onExport(): void {
    // Trigger export as needed.
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) {
      return 'Showing 0 customers';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} customers`;
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.loadCustomers();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
  }

  gridPrevPage(): void {
    if (this.currentPage > 1) this.onPageChange({ page: this.currentPage - 1, pageSize: this.pageSize });
  }

  gridNextPage(): void {
    if (this.currentPage < this.totalPages) this.onPageChange({ page: this.currentPage + 1, pageSize: this.pageSize });
  }

  onSortChange(sort: Sort): void {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.loadCustomers();
  }

  /** Paid = nothing left on the treatment plans, Unpaid = nothing paid yet, else Partially Paid; No Plan = no treatment billed. */
  private paymentStatus(c: Customer): string {
    const total = Number(c.total_amount ?? 0);
    const balance = Number(c.balance_amount ?? 0);
    if (total <= 0) return 'No Plan';
    if (balance <= 0) return 'Paid';
    return balance >= total ? 'Unpaid' : 'Partially Paid';
  }

  private mapCustomerToRow(customer: Customer): TableRow {
    return {
      id: customer.id,
      lead: { name: customer.name, subtitle: customer.customer_code, photo: customer.photo_url ?? undefined } as LeadCell,
      contact: customer.mobile_no,
      branch: customer.branch_name ?? '-',
      totalVisits: customer.visits,
      lastVisit: this.formatDate(customer.last_visit),
      totalAmount: this.formatCurrency(customer.total_amount),
      balanceAmount: this.formatCurrency(customer.balance_amount),
      paymentStatus: this.paymentStatus(customer),
      status: customer.status,
      actions: customer.converted_appointment_id ? [...QUICK_ACTIONS, RECEIPT_ACTION, INVOICE_ACTION, SITTINGS_ACTION] : QUICK_ACTIONS,
    };
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  onQuickAction({ row, action }: { row: TableRow; action: string }): void {
    const customer = this.customers.find((c) => c.id === Number(row['id']));
    if (!customer) return;

    if (action === 'view') this.openProfile(customer);
    else if (action === 'edit') this.openEdit(customer);
    else if (action === 'sittings') this.openSittings(customer);
    else if (action === 'payments') this.openPayments(customer);
    else if (action === 'receipt') this.openDocument(customer, 'receipt');
    else if (action === 'invoice') this.openDocument(customer, 'invoice');
  }

  /** Opens the receipt / tax invoice PDF of the customer's converted appointment in a new tab (opened in the click so it is not blocked). */
  openDocument(customer: Customer, kind: 'receipt' | 'invoice'): void {
    if (!customer.converted_appointment_id) return;
    const tab = window.open('', '_blank');
    this.api.GET_BLOB(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${customer.converted_appointment_id}/${kind}`).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (err: any) => {
        tab?.close();
        this.toast.error(kind === 'receipt' ? 'Could not open the receipt.' : 'Could not open the tax invoice.');
      },
    });
  }

  /** Customer Payments [customer-payments]: every payment collected from the customer, consultation and each sitting. */
  openPayments(customer: Customer): void {
    this.dialog.open(CustomerPaymentsDialog, {
      width: '860px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false, restoreFocus: true,
      data: { id: customer.id, name: customer.name },
    }).afterClosed().subscribe((changed) => { if (changed) this.loadCustomers(); });
  }

  /** Edit Customer [edit-customer]; after a save the list reloads from page 1, where the latest updated customer shows first. */
  openEdit(customer: Customer): void {
    this.dialog.open(EditCustomerDialog, {
      width: '760px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '94vh',
      autoFocus: false,
      restoreFocus: true,
      data: { id: customer.id, name: customer.name },
    }).afterClosed().subscribe((saved) => {
      if (!saved) return;
      this.currentPage = 1;
      this.loadCustomers();
    });
  }

  /** Add Treatment: find a customer / Nill Card person by ID or mobile, add another treatment or confirm the consultation. */
  openAddTreatment(): void {
    this.dialog.open(AddTreatmentDialog, {
      width: '820px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false, restoreFocus: true,
    }).afterClosed().subscribe((changed) => {
      if (!changed) return;
      this.currentPage = 1;
      this.loadCustomers();
    });
  }

  /** Treatment sittings of the customer's latest converted appointment; the list reloads after (visits / balance change). */
  openSittings(customer: Customer): void {
    if (!customer.converted_appointment_id) return;
    this.dialog.open(SittingsDialog, {
      width: '960px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false,
      panelClass: 'sittings-dialog', data: { appointmentId: customer.converted_appointment_id },
    }).afterClosed().subscribe(() => this.loadCustomers());
  }

  openProfileFromRow(row: TableRow): void {
    const customer = this.customers.find(item => item.id === Number(row['id']));
    if (customer) this.openProfile(customer);
  }

  /** Read-only customer details: profile, clinical examination, billing & payments and treatment sittings. */
  openProfile(customer: Customer): void {
    if (!customer.latest_appointment_id) {
      this.toast.warning(`${customer.name} has no appointment yet, so there are no details to show.`);
      return;
    }

    this.dialog.open(CustomerDetailsDialog, {
      width: '960px',
      maxWidth: 'calc(100vw - 24px)',
      maxHeight: '94vh',
      autoFocus: false,
      restoreFocus: true,
      panelClass: 'customer-details-dialog',
      data: { appointmentId: customer.latest_appointment_id },
    });
  }
}
