import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Sort, SortDirection } from '@angular/material/sort';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../shared/components/common-table-card/common-table-card';
import {
  BookingFormDialog,
  BookingFormResult,
} from '../../shared/components/booking-form-dialog/booking-form-dialog';
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
import { CrmFlowService, FlowAppointment } from '../../shared/common-services/crm-flow.service';
import { Customer, CustomerSegment } from './customer.model';
import {
  CustomerProfileDialog,
  CustomerProfileDialogResult,
} from './customer-profile-dialog/customer-profile-dialog';
import { AddCustomerForm, AddCustomerFormResult } from './add-customer-form/add-customer-form';
import { COMBO_OFFERS, PAYMENT_METHODS, PaymentStatus, TREATMENTS, treatmentByName } from '../../shared/data/treatment-catalog';

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'view', icon: 'bi-eye', label: 'View Profile', variant: 'primary' },
  { key: 'call', icon: 'bi-telephone', label: 'Call', variant: 'default' },
];

@Component({
  selector: 'app-customer-portal-page',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './customer-portal-page.html',
  styleUrl: './customer-portal-page.scss',
})
export class CustomerPortalPage implements OnInit {
  constructor(private dialog: MatDialog, private toast: ToastService, private crmFlow: CrmFlowService) { }

  readonly branches = ['Anna Nagar', 'Velachery', 'Indiranagar', 'Coimbatore', 'T Nagar', 'Bengaluru'];
  readonly segments: CustomerSegment[] = ['Regular', 'New'];
  readonly treatments = TREATMENTS;
  readonly combos = COMBO_OFFERS;
  readonly serviceOptions = TREATMENTS.map((t) => t.name);

  viewMode: 'grid' | 'table' = 'table';

  filters: FilterOption[] = [
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
    { key: 'source', label: 'Segment', options: this.segments },
    { key: 'branch', label: 'Branch', multiSelect: true, options: this.branches },
    { key: 'telecaller', label: 'Preferred Service', options: this.serviceOptions },
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
    { key: 'segment', header: 'Segment', type: 'badge' },
    { key: 'totalVisits', header: 'Visits', type: 'text', width: '70px' },
    { key: 'lastVisit', header: 'Last Visit', type: 'text' },
    { key: 'totalAmount', header: 'Total Amount', type: 'text' },
    { key: 'balanceAmount', header: 'Balance Amount', type: 'text' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'actions', header: 'Actions', type: 'quickActions', sortable: false, width: '80px' },
  ];

  readonly pageSizeOptions = [12, 24, 48];

  customers: Customer[] = [];
  pagedCustomers: Customer[] = [];
  rows: TableRow[] = [];

  currentPage = 1;
  pageSize = 12;
  totalRecords = 0;
  sortActive = 'lead';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  ngOnInit(): void {
    this.customers = this.buildSeedCustomers();
    const imported = this.crmFlow.getClients().map((client, index) => this.flowClientToCustomer(client, index));
    this.customers = [...imported, ...this.customers.filter(customer => !imported.some(client => client.phone === customer.phone))];
    this.refreshRows();
  }

  private flowClientToCustomer(client: FlowAppointment, index: number): Customer {
    return {
      id: `CUS-FLOW-${client.id}-${index}`,
      name: client.name,
      phone: client.phone,
      email: '-',
      gender: client.gender,
      branch: client.branch,
      segment: 'New',
      status: 'Active',
      memberSince: client.date,
      totalVisits: 1,
      lastVisit: client.date,
      totalAmount: client.total,
      preferredService: client.service,
      visitHistory: [{ date: client.date, service: client.service, branch: client.branch, amount: client.total, discount: 0, amountPaid: client.paymentStatus === 'Paid' ? client.total : 0, paymentMethod: client.paymentMethod, paymentStatus: client.paymentStatus }],
    };
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
    return `₹${value.toLocaleString('en-IN')}`;
  }

  /** Sum of amount still owed across every recorded visit (Partial/Pending payments). */
  balanceAmount(customer: Customer): number {
    return customer.visitHistory.reduce((sum, visit) => sum + Math.max(0, visit.amount - visit.amountPaid), 0);
  }

  formatDate(iso: string): string {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ---------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------

  get stats(): DetailCardData[] {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const newThisMonth = this.customers.filter((c) => c.memberSince.startsWith(monthKey));
    const active = this.customers.filter((c) => c.status === 'Active');
    const avgLifetime = this.customers.length
      ? Math.round(this.customers.reduce((sum, c) => sum + c.totalAmount, 0) / this.customers.length)
      : 0;

    return [
      { label: 'Total Customers', value: this.customers.length.toLocaleString(), trendText: 'Across all branches', trendDirection: 'neutral' },
      { label: 'New This Month', value: newThisMonth.length, trendText: 'Recently onboarded', trendDirection: 'up' },
      { label: 'Active Customers', value: active.length, trendText: `${this.customers.length ? Math.round((active.length / this.customers.length) * 100) : 0}% of base`, trendDirection: 'up' },
      { label: 'Avg. Total Amount', value: this.formatCurrency(avgLifetime), trendText: 'Per customer', trendDirection: 'neutral' },
    ];
  }

  // ---------------------------------------------------------------------
  // Filtering, sorting, pagination
  // ---------------------------------------------------------------------

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;
    this.refreshRows();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.refreshRows();
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
    this.refreshRows();
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
    this.refreshRows();
  }

  private getFilteredCustomers(): Customer[] {
    return this.customers.filter((customer) => {
      if (this.searchTerm) {
        const haystack = `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase();
        if (!haystack.includes(this.searchTerm)) return false;
      }

      if (this.filterState.status && customer.status !== this.filterState.status) return false;
      if (this.filterState.source && customer.segment !== this.filterState.source) return false;
      if (this.filterState.branch.length > 0 && !this.filterState.branch.includes(customer.branch)) return false;
      if (this.filterState.telecaller && customer.preferredService !== this.filterState.telecaller) return false;
      if (this.filterState.dateFrom && customer.lastVisit < this.filterState.dateFrom) return false;
      if (this.filterState.dateTo && customer.lastVisit > this.filterState.dateTo) return false;

      return true;
    });
  }

  private getSortedCustomers(customers: Customer[]): Customer[] {
    if (!this.sortActive || !this.sortDirection) return customers;

    const direction = this.sortDirection === 'asc' ? 1 : -1;

    return [...customers].sort((left, right) => {
      const leftValue = this.getSortableValue(left, this.sortActive);
      const rightValue = this.getSortableValue(right, this.sortActive);

      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return 1 * direction;
      return 0;
    });
  }

  private getSortableValue(customer: Customer, key: string): string | number {
    if (key === 'lead') return customer.name.toLowerCase();
    if (key === 'totalVisits') return customer.totalVisits;
    if (key === 'totalAmount') return customer.totalAmount;
    if (key === 'balanceAmount') return this.balanceAmount(customer);
    if (key === 'lastVisit') return customer.lastVisit;

    const value = (customer as unknown as Record<string, unknown>)[key];
    if (typeof value === 'number') return value;
    return String(value ?? '').toLowerCase();
  }

  private refreshRows(): void {
    const filtered = this.getFilteredCustomers();
    const sorted = this.getSortedCustomers(filtered);

    this.totalRecords = sorted.length;

    const totalPages = Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;

    this.pagedCustomers = sorted.slice(startIndex, endIndex);
    this.rows = this.pagedCustomers.map((customer) => this.mapCustomerToRow(customer));
  }

  private mapCustomerToRow(customer: Customer): TableRow {
    return {
      id: customer.id,
      lead: { name: customer.name, subtitle: customer.id } as LeadCell,
      contact: customer.phone,
      branch: customer.branch,
      segment: customer.segment,
      totalVisits: customer.totalVisits,
      lastVisit: this.formatDate(customer.lastVisit),
      totalAmount: this.formatCurrency(customer.totalAmount),
      balanceAmount: this.formatCurrency(this.balanceAmount(customer)),
      status: customer.status,
      actions: QUICK_ACTIONS,
    };
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  onQuickAction({ row, action }: { row: TableRow; action: string }): void {
    const id = row['id'] as string;
    const customer = this.customers.find((c) => c.id === id);
    if (!customer) return;

    if (action === 'view') this.openProfile(customer);
    else if (action === 'call') window.location.href = `tel:${customer.phone.replace(/\s+/g, '')}`;
  }

  openProfileFromRow(row: TableRow): void {
    const id = String(row['id'] ?? '');
    const customer = this.customers.find(item => item.id === id);
    if (customer) this.openProfile(customer);
  }

  openProfile(customer: Customer): void {
    const dialogRef = this.dialog.open(CustomerProfileDialog, {
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '90vh',
      autoFocus: false,
      restoreFocus: true,
      panelClass: 'customer-profile-dialog',
      data: { customer },
    });

    dialogRef.afterClosed().subscribe((result: CustomerProfileDialogResult | undefined) => {
      if (result?.action === 'book') {
        this.openBookingFor(result.customer);
      }
    });
  }

  private openBookingFor(customer: Customer): void {
    const dialogRef = this.dialog.open(BookingFormDialog, {
      width: '640px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      panelClass: 'booking-form-dialog',
      data: {
        mode: 'appointment',
        branches: this.branches,
        staffOptions: ['Priya Sharma', 'Arun Kumar', 'Divya Raj', 'Karthik S', 'Meera Nair'],
        treatments: this.treatments,
        combos: this.combos,
        initial: {
          customerName: customer.name,
          phone: customer.phone,
          branch: customer.branch,
          service: customer.preferredService,
        },
      },
    });

    dialogRef.afterClosed().subscribe((result: BookingFormResult | undefined) => {
      if (!result) return;

      // Reflect the new booking straight onto this customer's visit history/lifetime
      // value so the profile the staff member just booked from stays in sync.
      customer.visitHistory = [
        {
          date: result.date,
          service: result.service,
          branch: result.branch,
          amount: result.total,
          discount: result.discountAmount,
          amountPaid: result.amountPaid,
          paymentMethod: result.paymentMethod,
          paymentStatus: result.paymentStatus,
        },
        ...customer.visitHistory,
      ];
      customer.totalVisits += 1;
      customer.lastVisit = result.date;
      customer.totalAmount += result.total;

      this.refreshRows();
      this.toast.success('Appointment booked', `${result.customerName} - ${result.date}`);
    });
  }

  openAddCustomer(): void {
    const dialogRef = this.dialog.open(AddCustomerForm, {
      width: '640px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      panelClass: 'add-customer-dialog',
      data: { branches: this.branches, segments: this.segments, serviceOptions: this.serviceOptions },
    });

    dialogRef.afterClosed().subscribe((result: AddCustomerFormResult | undefined) => {
      if (!result) return;

      const today = this.toIso(new Date());
      const newCustomer: Customer = {
        id: `CUS-${Date.now()}`,
        name: result.name,
        phone: result.phone,
        email: result.email || '-',
        gender: result.gender,
        branch: result.branch,
        segment: (result.segment as CustomerSegment) || 'New',
        status: 'Active',
        memberSince: today,
        totalVisits: 0,
        lastVisit: today,
        totalAmount: 0,
        preferredService: result.preferredService,
        visitHistory: [],
      };

      this.customers = [newCustomer, ...this.customers];
      this.currentPage = 1;
      this.toast.success('Customer added', `${newCustomer.name} has been registered.`);
      this.refreshRows();
    });
  }

  // ---------------------------------------------------------------------
  // Seed data
  // ---------------------------------------------------------------------

  private buildSeedCustomers(): Customer[] {
    const addDays = (days: number): string => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return this.toIso(d);
    };

    const seeds: Omit<Customer, 'id' | 'visitHistory'>[] = [
      { name: 'Ananya Sharma', phone: '+91 98765 43210', email: 'ananya.sharma@example.com', gender: 'F', branch: 'Anna Nagar', segment: 'Regular', status: 'Active', memberSince: addDays(-420), totalVisits: 18, lastVisit: addDays(-2), totalAmount: 84500, preferredService: 'Hair Loss Consultation' },
      { name: 'Rahul Kumar', phone: '+91 91234 56780', email: 'rahul.kumar@example.com', gender: 'M', branch: 'Velachery', segment: 'Regular', status: 'Active', memberSince: addDays(-260), totalVisits: 9, lastVisit: addDays(-8), totalAmount: 32800, preferredService: 'Acne Treatment' },
      { name: 'Sneha Menon', phone: '+91 98867 66554', email: 'sneha.menon@example.com', gender: 'F', branch: 'Indiranagar', segment: 'Regular', status: 'Active', memberSince: addDays(-540), totalVisits: 26, lastVisit: addDays(-1), totalAmount: 121000, preferredService: 'Anti-Aging Therapy' },
      { name: 'Vikram Patel', phone: '+91 90123 45678', email: 'vikram.patel@example.com', gender: 'M', branch: 'Coimbatore', segment: 'Regular', status: 'Inactive', memberSince: addDays(-610), totalVisits: 5, lastVisit: addDays(-180), totalAmount: 15200, preferredService: 'Dermatology Review' },
      { name: 'Neha Prasad', phone: '+91 93450 78920', email: 'neha.prasad@example.com', gender: 'F', branch: 'Anna Nagar', segment: 'New', status: 'Active', memberSince: addDays(-12), totalVisits: 2, lastVisit: addDays(-3), totalAmount: 6400, preferredService: 'Skin Rejuvenation' },
      { name: 'Kavin Raj', phone: '+91 99520 13840', email: 'kavin.raj@example.com', gender: 'M', branch: 'T Nagar', segment: 'Regular', status: 'Active', memberSince: addDays(-190), totalVisits: 7, lastVisit: addDays(-15), totalAmount: 27300, preferredService: 'Laser Toning' },
      { name: 'Divya Bala', phone: '+91 90876 54321', email: 'divya.bala@example.com', gender: 'F', branch: 'Bengaluru', segment: 'Regular', status: 'Active', memberSince: addDays(-700), totalVisits: 34, lastVisit: addDays(-5), totalAmount: 156000, preferredService: 'Bridal Package' },
      { name: 'Arjun Nair', phone: '+91 91987 65432', email: 'arjun.nair@example.com', gender: 'M', branch: 'Velachery', segment: 'New', status: 'Active', memberSince: addDays(-20), totalVisits: 1, lastVisit: addDays(-20), totalAmount: 3200, preferredService: 'Hair Loss Consultation' },
      { name: 'Meera Iyer', phone: '+91 97654 32109', email: 'meera.iyer@example.com', gender: 'F', branch: 'Indiranagar', segment: 'Regular', status: 'Active', memberSince: addDays(-310), totalVisits: 11, lastVisit: addDays(-9), totalAmount: 39600, preferredService: 'Acne Treatment' },
      { name: 'Suresh Babu', phone: '+91 96543 21098', email: 'suresh.babu@example.com', gender: 'M', branch: 'Coimbatore', segment: 'Regular', status: 'Inactive', memberSince: addDays(-500), totalVisits: 6, lastVisit: addDays(-210), totalAmount: 19800, preferredService: 'Anti-Aging Therapy' },
      { name: 'Lakshmi Narayan', phone: '+91 95432 10987', email: 'lakshmi.narayan@example.com', gender: 'F', branch: 'T Nagar', segment: 'Regular', status: 'Active', memberSince: addDays(-480), totalVisits: 21, lastVisit: addDays(-4), totalAmount: 98700, preferredService: 'Dermatology Review' },
      { name: 'Ganesh Prasad', phone: '+91 94321 09876', email: 'ganesh.prasad@example.com', gender: 'M', branch: 'Anna Nagar', segment: 'New', status: 'Active', memberSince: addDays(-25), totalVisits: 2, lastVisit: addDays(-6), totalAmount: 5400, preferredService: 'Skin Rejuvenation' },
      { name: 'Priyanka Rao', phone: '+91 93210 98765', email: 'priyanka.rao@example.com', gender: 'F', branch: 'Bengaluru', segment: 'Regular', status: 'Active', memberSince: addDays(-220), totalVisits: 8, lastVisit: addDays(-11), totalAmount: 28900, preferredService: 'Laser Toning' },
      { name: 'Manoj Verma', phone: '+91 92109 87654', email: 'manoj.verma@example.com', gender: 'M', branch: 'Velachery', segment: 'Regular', status: 'Active', memberSince: addDays(-160), totalVisits: 6, lastVisit: addDays(-18), totalAmount: 22100, preferredService: 'Bridal Package' },
      { name: 'Anitha Krishnan', phone: '+91 91098 76543', email: 'anitha.krishnan@example.com', gender: 'F', branch: 'Coimbatore', segment: 'Regular', status: 'Active', memberSince: addDays(-650), totalVisits: 29, lastVisit: addDays(-7), totalAmount: 134500, preferredService: 'Hair Loss Consultation' },
      { name: 'Deepak Chandran', phone: '+91 90987 65432', email: 'deepak.chandran@example.com', gender: 'M', branch: 'T Nagar', segment: 'Regular', status: 'Inactive', memberSince: addDays(-390), totalVisits: 4, lastVisit: addDays(-240), totalAmount: 12600, preferredService: 'Acne Treatment' },
      { name: 'Revathi Sundaram', phone: '+91 89876 54321', email: 'revathi.sundaram@example.com', gender: 'F', branch: 'Anna Nagar', segment: 'New', status: 'Active', memberSince: addDays(-6), totalVisits: 1, lastVisit: addDays(-6), totalAmount: 2800, preferredService: 'Skin Rejuvenation' },
      { name: 'Harish Kumar', phone: '+91 88765 43210', email: 'harish.kumar@example.com', gender: 'M', branch: 'Indiranagar', segment: 'Regular', status: 'Active', memberSince: addDays(-280), totalVisits: 10, lastVisit: addDays(-13), totalAmount: 35200, preferredService: 'Dermatology Review' },
    ];

    return seeds.map((seed, index) => {
      const id = `CUS-${3000 + index}`;
      const visitHistory = Array.from({ length: Math.min(seed.totalVisits, 3) }, (_, i) => {
        const serviceName = this.serviceOptions[(index + i) % this.serviceOptions.length];
        const amount = treatmentByName(serviceName)?.price ?? 1000;
        // Every 4th visit had a small discount applied; the most recent visit for every
        // 6th customer is still awaiting the balance, to give the profile dialog some
        // realistic payment variety instead of everything looking "Paid".
        const discount = (index + i) % 4 === 0 ? Math.round(amount * 0.1) : 0;
        const billed = amount - discount;
        const paymentStatus: PaymentStatus = i === 0 && index % 6 === 0 ? 'Partial' : 'Paid';
        const amountPaid = paymentStatus === 'Partial' ? Math.round(billed / 2) : billed;

        return {
          date: addDays(-(i + 1) * 30 - index),
          service: serviceName,
          branch: seed.branch,
          amount: billed,
          discount,
          amountPaid,
          paymentMethod: PAYMENT_METHODS[(index + i) % PAYMENT_METHODS.length],
          paymentStatus,
        };
      });

      return { id, ...seed, visitHistory };
    });
  }
}
