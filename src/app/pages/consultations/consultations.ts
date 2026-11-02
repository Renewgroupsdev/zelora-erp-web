import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Sort, SortDirection } from '@angular/material/sort';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../shared/components/common-table-card/common-table-card';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';
import {
  CommonFilterState,
  DetailCardData,
  FilterOption,
  QuickAction,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '../../shared/models/common-components.model';
import { BranchOptionsService } from '../../shared/common-services/branch-options.service';
import { ToastService } from '../../shared/common-services/toast.service';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { AuthService } from '../../core/auth/auth.service';
import { FlowAppointmentRecord, inr, treatmentNames } from '../../shared/models/appointment-flow.model';
import { AppointmentWizard } from '../appointment-page/appointment-wizard/appointment-wizard';
import { NillCardView } from './nill-card-view/nill-card-view';

/** Consultation started, payment not saved yet: reopens the consultation form. */
const CONSULTATION_STATUS = 'In Consultation';
/** The treatment was too costly - only the consultation fee was collected: view only. */
const CONSULTATION_ONLY = 'Consultation Only';
const LISTED_STATUSES: string[] = [CONSULTATION_STATUS, CONSULTATION_ONLY];

/**
 * Lead Management -> Nill Card. Lists the appointments still In Consultation (payment pending - the consultation
 * form reopens to finish them) and the Consultation Only ones (only the consultation fee was paid - view only, with
 * the last visit, the fee and the treatment that was suggested).
 */
@Component({
  selector: 'app-consultations',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './consultations.html',
  styleUrl: './consultations.scss',
})
export class Consultations implements OnInit {
  private readonly branchOptions = inject(BranchOptionsService);
  private readonly auth = inject(AuthService);
  constructor(private dialog: MatDialog, private toast: ToastService, private api: ApiDataService) { }

  filters: FilterOption[] = [
    { key: 'branch', label: 'Branch', multiSelect: true, options: [] },
    { key: 'date', label: 'Date' },
  ];
  filterState: CommonFilterState = { status: null, source: null, branch: [], telecaller: null, dateFrom: null, dateTo: null };

  columns: TableColumn[] = [
    { key: 'lead', header: 'Customer', type: 'lead' },
    { key: 'contact', header: 'Contact', type: 'text' },
    { key: 'service', header: 'Treatment', type: 'text' },
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'schedule', header: 'Last visit', type: 'text' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'total', header: 'Amount', type: 'text', width: '100px' },
    { key: 'paymentStatus', header: 'Payment', type: 'badge', width: '90px' },
    { key: 'actions', header: 'Actions', type: 'quickActions', sortable: false, width: '130px' },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];

  appointments: FlowAppointmentRecord[] = [];
  rows: TableRow[] = [];
  loading = false;
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = '';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  ngOnInit(): void {
    this.branchOptions.load().subscribe(list => {
      const names = list.map(b => b.name);
      this.filters = this.filters.map(f => (f.key === 'branch' ? { ...f, options: names } : f));
    });
    this.loadConsultations();
  }

  can(action: string): boolean {
    return this.auth.hasActionAccess(action);
  }

  /** Asks the API for the listed statuses only; date and search are filtered by the API, branch and status here. */
  loadConsultations(): void {
    this.loading = true;
    const params = new URLSearchParams({ per_page: '500' });
    LISTED_STATUSES.forEach(s => params.append('status[]', s));
    if (this.filterState.dateFrom) params.set('date_from', this.filterState.dateFrom);
    if (this.filterState.dateTo) params.set('date_to', this.filterState.dateTo);
    if (this.searchTerm) params.set('search', this.searchTerm);

    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}?${params}`).subscribe({
      next: (res: any) => {
        const list: FlowAppointmentRecord[] = res?.data?.data ?? [];
        this.appointments = list.filter(a => LISTED_STATUSES.includes(a.status));
        this.loading = false;
        this.refreshRows();
      },
      error: (err: any) => {
        this.loading = false;
        this.toast.error(err?.error?.message || 'Could not load consultations.');
      },
    });
  }

  // ---------------------------------------------------------------- stats

  get stats(): DetailCardData[] {
    const today = this.toIso(new Date());
    const open = this.appointments.filter(a => a.status === CONSULTATION_STATUS);
    const feeOnly = this.appointments.filter(a => a.status === CONSULTATION_ONLY);
    const pending = open.reduce((sum, a) => sum + Math.max(0, Number(a.total_amount || 0) - Number(a.paid_amount || 0)), 0);
    const fees = feeOnly.reduce((sum, a) => sum + Number(a.consultation_fee || 0), 0);
    return [
      { label: 'In Consultation', value: open.length, trendText: 'Payment pending', trendDirection: 'neutral', icon: 'bi-clipboard2-pulse', iconVariant: 'orange' },
      { label: 'Consultation Only', value: feeOnly.length, trendText: 'Treatment not taken', trendDirection: 'neutral', icon: 'bi-person-check', iconVariant: 'primary' },
      { label: 'Consultation Fees', value: inr(fees), trendText: 'Collected', trendDirection: 'neutral', icon: 'bi-cash-coin', iconVariant: 'green' },
      { label: "Today's Visits", value: this.appointments.filter(a => a.appointment_date === today).length, trendText: 'On this list', trendDirection: 'neutral', icon: 'bi-calendar-check', iconVariant: 'primary' },
      { label: 'Pending Amount', value: inr(pending), trendText: 'To be collected', trendDirection: 'neutral', icon: 'bi-cash-stack', iconVariant: 'blue' },
    ];
  }

  // ---------------------------------------------------------------- table

  onSearch(term: string): void {
    this.searchTerm = term.trim();
    this.currentPage = 1;
    this.loadConsultations();
  }

  onFilterClick(_key: string): void { }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.loadConsultations();
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) return 'Showing 0 consultations';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} consultations`;
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.refreshRows();
  }

  onSortChange(sort: Sort): void {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.refreshRows();
  }

  onQuickAction({ row, action }: { row: TableRow; action: string }): void {
    const appt = this.appointments.find(a => a.id === Number(row['id']));
    if (!appt) return;
    if (action === 'wizard') this.openWizard(appt);
    if (action === 'view') this.openView(appt);
  }

  /** Consultation Only: read-only view (last visit, fee paid, basic details, the treatment suggested). */
  openView(appt: FlowAppointmentRecord): void {
    this.dialog.open(NillCardView, {
      width: '760px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false,
      panelClass: 'appointment-wizard-dialog', data: { appointmentId: appt.id },
    });
  }

  /** Reopens the consultation form where the user left off (payment step). */
  openWizard(appt: FlowAppointmentRecord): void {
    if (!this.can('continue-consultation-form')) return void this.toast.warning('Your role cannot open the consultation form.');
    this.dialog.open(AppointmentWizard, {
      width: '880px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false, disableClose: true,
      panelClass: 'appointment-wizard-dialog', data: { appointmentId: appt.id },
    }).afterClosed().subscribe((changed: boolean) => {
      if (changed) this.loadConsultations(); // payment saved -> it leaves this list
    });
  }

  private toIso(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private displayDate(iso: string): string {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return `${String(date.getDate()).padStart(2, '0')}-${date.toLocaleString('en-US', { month: 'short' })}-${date.getFullYear()}`;
  }

  private displayTime(time: string | null | undefined): string {
    if (!time) return '';
    const [hh, mm] = time.split(':').map(Number);
    if (Number.isNaN(hh)) return time;
    return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
  }

  private mapRow(a: FlowAppointmentRecord): TableRow {
    const feeOnly = a.status === CONSULTATION_ONLY;
    const actions: QuickAction[] = feeOnly
      ? [{ key: 'view', icon: 'bi-eye', label: 'View', variant: 'primary' }]
      : this.can('continue-consultation-form')
        ? [{ key: 'wizard', icon: 'bi-clipboard2-pulse', label: 'Consultation form', variant: 'primary' }]
        : [];
    return {
      id: a.id,
      lead: { name: a.name, subtitle: a.customer?.customer_code ?? `AP-${String(a.id).padStart(5, '0')}` },
      contact: a.mobile_no,
      service: treatmentNames(a) ?? (a.category ? `${a.category} consultation` : 'Consultation'),
      branch: a.branch_name ?? a.branch?.name ?? '',
      schedule: `${this.displayDate(a.appointment_date)}, ${this.displayTime(a.appointment_time)}`,
      scheduleSort: `${a.appointment_date} ${a.appointment_time ?? ''}`,
      status: a.status,
      // Consultation Only: the fee collected (the treatment quoted is in the view).
      total: feeOnly ? inr(a.consultation_fee) : Number(a.total_amount) ? inr(a.total_amount) : '-',
      totalSort: feeOnly ? Number(a.consultation_fee) : Number(a.total_amount),
      paymentStatus: feeOnly ? 'Consultation fee' : a.payment_status ?? 'Pending',
      actions,
    };
  }

  private refreshRows(): void {
    const branches = this.filterState.branch;
    const filtered = this.appointments.filter(a => !branches.length || branches.includes(a.branch_name ?? a.branch?.name ?? ''));
    const dir = this.sortDirection === 'desc' ? -1 : 1;
    const key = this.sortActive === 'schedule' ? 'scheduleSort' : this.sortActive === 'total' ? 'totalSort' : this.sortActive;
    const value = (row: TableRow) => {
      const v = row[key];
      if (key === 'lead') return String((v as any)?.name ?? '').toLowerCase();
      return typeof v === 'number' ? v : String(v ?? '').toLowerCase();
    };
    const mapped = filtered.map(a => this.mapRow(a));
    const sorted = !this.sortActive ? mapped : mapped.sort((l, r) => (value(l) < value(r) ? -dir : value(l) > value(r) ? dir : 0));

    this.totalRecords = sorted.length;
    const totalPages = Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    const start = (this.currentPage - 1) * this.pageSize;
    this.rows = sorted.slice(start, start + this.pageSize);
  }
}
