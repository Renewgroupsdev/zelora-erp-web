import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { BranchOptionsService } from '../../shared/common-services/branch-options.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Sort, SortDirection } from '@angular/material/sort';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../shared/components/common-table-card/common-table-card';
import {
  CommonFilterState,
  DetailCardData,
  FilterOption,
  QuickAction,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '../../shared/models/common-components.model';
import { ToastService } from '../../shared/common-services/toast.service';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { FlowAppointmentRecord, FlowStatus, inr, treatmentNames } from '../../shared/models/appointment-flow.model';
import { AppointmentWizard } from './appointment-wizard/appointment-wizard';
import { CustomerDetailsDialog } from './customer-details-dialog/customer-details-dialog';
import { NewAppointmentDialog, NewAppointmentPreset, NewAppointmentResult } from './new-appointment-dialog/new-appointment-dialog';
import { AppointmentCalendar, CalendarSelection, CalendarView, calendarRange, toIsoDate } from './appointment-calendar/appointment-calendar';
import { openLeadAudit } from '../../shared/components/lead-dialogs/lead-audit-dialog';
import { AuthService } from '../../core/auth/auth.service';
import { CanActionDirective } from '../../shared/directives/can-action.directive';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';

/** Converted is left out: a converted appointment is a customer, listed (with its sittings) in Customer Management. */
const STATUSES: FlowStatus[] = ['Scheduled', 'In Consultation', 'Awaiting Terms', 'Invoiced', 'Cancelled'];

/**
 * Appointments booked by telecallers (a follow-up turned into a visit), shown as a slot calendar (month / week /
 * day) or as a list. Each one is worked through the consultation wizard, then the invoice, then becomes a
 * customer - from there its treatment sittings are tracked in Customer Management.
 */
@Component({
  selector: 'app-appointment-page',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, CanActionDirective, AppointmentCalendar],
  templateUrl: './appointment-page.html',
  styleUrl: './appointment-page.scss',
})
export class AppointmentPage implements OnInit {
  private readonly branchOptions = inject(BranchOptionsService);
  constructor(private dialog: MatDialog, private toast: ToastService, private api: ApiDataService) { }

  readonly inr = inr;
  private readonly auth = inject(AuthService);

  /** Roles & Permissions -> Appointment module action ticked for the signed-in role. */
  can(action: string): boolean {
    return this.auth.hasActionAccess(action);
  }

  /** Calendar (slot booking) is the default; the list keeps the table for searching / sorting. */
  mode: 'calendar' | 'list' = 'calendar';
  calendarView: CalendarView = 'week';
  calendarDate = new Date();

  private branchNames: string[] = [];
  filters: FilterOption[] = this.buildFilters();

  filterState: CommonFilterState = { status: null, source: null, branch: [], telecaller: null, dateFrom: null, dateTo: null };

  columns: TableColumn[] = [
    { key: 'lead', header: 'Customer', type: 'lead' },
    { key: 'contact', header: 'Contact', type: 'text' },
    { key: 'service', header: 'Treatment', type: 'text' },
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'schedule', header: 'Date & Time', type: 'text' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'total', header: 'Amount', type: 'text', width: '100px' },
    { key: 'paymentStatus', header: 'Payment', type: 'badge', width: '90px' },
    { key: 'actions', header: 'Actions', type: 'quickActions', sortable: false, width: '130px' },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];

  appointments: FlowAppointmentRecord[] = [];
  /** Stat-card counts from the list API's top-level `summary`. */
  summary = { total: 0, today: 0, scheduled: 0, in_progress: 0, converted: 0 };
  rows: TableRow[] = [];
  loading = false;
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'schedule';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';
  private listSub?: Subscription;

  ngOnInit(): void {
    this.loadBranches();
    this.loadAppointments();
  }

  // ---------------------------------------------------------------- data

  /** The Date filter belongs to the list; the calendar picks its dates by navigating. */
  private buildFilters(): FilterOption[] {
    return [
      { key: 'status', label: 'Status', options: STATUSES },
      { key: 'branch', label: 'Branch', multiSelect: true, options: this.branchNames },
      ...(this.mode === 'list' ? [{ key: 'date', label: 'Date' }] : []),
    ];
  }

  private loadBranches(): void {
    this.branchOptions.load().subscribe(list => {
      this.branchNames = list.map(b => b.name);
      this.filters = this.buildFilters();
    });
  }

  /** Status, dates and search are filtered by the API; branch by name here. The calendar loads only the
   *  days on screen, the list uses the Date filter. */
  loadAppointments(): void {
    this.loading = true;
    const params = new URLSearchParams({ per_page: '500' });
    if (this.filterState.status) params.set('status', this.filterState.status);
    if (this.mode === 'calendar') {
      const { from, to } = calendarRange(this.calendarView, this.calendarDate);
      params.set('date_from', toIsoDate(from));
      params.set('date_to', toIsoDate(to));
    } else {
      if (this.filterState.dateFrom) params.set('date_from', this.filterState.dateFrom);
      if (this.filterState.dateTo) params.set('date_to', this.filterState.dateTo);
    }
    if (this.searchTerm) params.set('search', this.searchTerm);

    // A newer range / filter supersedes a request still in flight.
    this.listSub?.unsubscribe();
    this.listSub = this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}?${params}`).subscribe({
      next: (res: any) => {
        this.appointments = res?.data?.data ?? [];
        const s = res?.summary;
        if (s) this.summary = { total: +s.total || 0, today: +s.today || 0, scheduled: +s.scheduled || 0, in_progress: +s.in_progress || 0, converted: +s.converted || 0 };
        this.loading = false;
        this.refreshRows();
        this.refreshPanel();
      },
      error: (err: any) => {
        this.loading = false;
        this.toast.error(err?.error?.message || 'Could not load appointments.');
      },
    });
  }

  private matchesBranch(a: FlowAppointmentRecord): boolean {
    const branches = this.filterState.branch;
    return !branches.length || branches.includes(a.branch_name ?? a.branch?.name ?? '');
  }

  /** Every booking in the calendar range (converted / cancelled too - they still held the slot), by branch. */
  get calendarAppointments(): FlowAppointmentRecord[] {
    return this.appointments.filter(a => this.matchesBranch(a));
  }

  // ---------------------------------------------------------------- calendar

  setMode(mode: 'calendar' | 'list'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.filters = this.buildFilters();
    this.currentPage = 1;
    this.loadAppointments();
  }

  onCalendarView(view: CalendarView): void {
    this.calendarView = view;
    this.loadAppointments();
  }

  onCalendarDate(date: Date): void {
    this.calendarDate = date;
    this.loadAppointments();
  }

  /** A free slot: book a new appointment at that date and time. */
  onSlotSelect(slot: NewAppointmentPreset): void {
    if (!this.can('add-appointment')) return;
    this.openWizard(undefined, slot);
  }

  // ---------------------------------------------------------------- slide-over panel

  /** Bookings of the clicked slot (or one booking), shown as cards with their actions. */
  panel: CalendarSelection | null = null;

  openPanel(selection: CalendarSelection): void {
    this.panel = selection;
  }

  closePanel(): void {
    this.panel = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // A dialog opened from the panel handles its own Escape.
    if (!this.dialog.openDialogs.length) this.closePanel();
  }

  /** After a reload the panel shows the fresh records (status, payment) of the same bookings. */
  private refreshPanel(): void {
    if (!this.panel) return;
    const byId = new Map(this.appointments.map(a => [a.id, a]));
    this.panel = { ...this.panel, appointments: this.panel.appointments.map(a => byId.get(a.id) ?? a) };
  }

  canOpenForm(a: FlowAppointmentRecord): boolean {
    return a.status !== 'Cancelled' && this.can('consultation-form');
  }

  panelAction(action: 'form' | 'invoice' | 'profile' | 'audit', a: FlowAppointmentRecord): void {
    if (action === 'form') this.openWizardFor(a.id);
    else if (action === 'invoice') this.downloadInvoice(a);
    else if (action === 'audit') openLeadAudit(this.dialog, { id: a.id, name: a.name, kind: 'appointment' });
    else this.openProfile(a);
  }

  serviceOf(a: FlowAppointmentRecord): string {
    return treatmentNames(a) || (a.category ? `${a.category} consultation` : 'Consultation');
  }

  statusTone(status: FlowStatus): string {
    if (status === 'Scheduled') return 'blue';
    if (status === 'In Consultation' || status === 'Awaiting Terms') return 'orange';
    if (status === 'Invoiced') return 'purple';
    if (status === 'Converted') return 'green';
    if (status === 'Cancelled') return 'red';
    return 'gray';
  }

  paymentTone(a: FlowAppointmentRecord): string {
    const s = this.paymentStatus(a);
    return s === 'Paid' ? 'green' : s === 'Partial' ? 'orange' : 'gray';
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  pad(id: number): string {
    return String(id).padStart(5, '0');
  }

  readonly Number = Number;

  // ---------------------------------------------------------------- formatting

  private formatDisplayDate(iso: string): string {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return `${String(date.getDate()).padStart(2, '0')}-${date.toLocaleString('en-US', { month: 'short' })}-${date.getFullYear()}`;
  }

  formatTime(time: string | null | undefined): string {
    if (!time) return '';
    const [hh, mm] = time.split(':').map(Number);
    if (Number.isNaN(hh)) return time;
    return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
  }

  /** Payment status as sent by the API (`payment_status`). */
  paymentStatus(a: FlowAppointmentRecord): 'Paid' | 'Partial' | 'Pending' {
    return a.payment_status ?? 'Pending';
  }

  // ---------------------------------------------------------------- stats

  get stats(): DetailCardData[] {
    const s = this.summary;
    const converted = s.converted;
    const rate = s.total ? Math.round((converted / s.total) * 100) : 0;

    return [
      { label: "Today's Appointments", value: s.today, trendText: 'Visits booked for today', trendDirection: 'neutral', icon: 'bi-calendar-check', iconVariant: 'primary' },
      { label: 'Scheduled', value: s.scheduled, trendText: 'Waiting for consultation', trendDirection: 'neutral', icon: 'bi-clock-history', iconVariant: 'blue' },
      { label: 'In Progress', value: s.in_progress, trendText: 'Consultation / terms / invoice', trendDirection: 'neutral', icon: 'bi-clipboard2-pulse', iconVariant: 'orange' },
      { label: 'Converted', value: converted, trendText: `${rate}% of appointments`, trendDirection: 'neutral', icon: 'bi-person-check', iconVariant: 'green' },
    ];
  }

  // ---------------------------------------------------------------- table

  onSearch(term: string): void {
    this.searchTerm = term.trim();
    this.currentPage = 1;
    this.loadAppointments();
  }

  onFilterClick(_key: string): void { }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.loadAppointments();
  }

  onExport(): void { }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) return 'Showing 0 appointments';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} appointments`;
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

  private actionsFor(a: FlowAppointmentRecord): QuickAction[] {
    const actions: QuickAction[] = [];
    if (a.status !== 'Cancelled' && this.can('consultation-form')) {
      actions.push({ key: 'wizard', icon: 'bi-clipboard2-pulse', label: 'Consultation form', variant: 'primary' });
    }
    if (a.invoice_no && this.can('download-invoice')) actions.push({ key: 'invoice', icon: 'bi-receipt', label: 'Download invoice', variant: 'default' });
    return actions;
  }

  onQuickAction({ row, action }: { row: TableRow; action: string }): void {
    const appt = this.appointments.find(a => a.id === Number(row['id']));
    if (!appt) return;

    if (action === 'wizard') this.openWizard(appt);
    else if (action === 'invoice') this.downloadInvoice(appt);
  }

  /** Customer name link: the full customer record, view only (editing stays in the form / sittings actions). */
  openAppointmentProfile(row: TableRow): void {
    const appt = this.appointments.find(a => a.id === Number(row['id']));
    if (appt) this.openProfile(appt);
  }

  private openProfile(appt: FlowAppointmentRecord): void {
    if (!this.can('customer-details')) return void this.toast.warning('Your role cannot view customer details.');
    this.dialog.open(CustomerDetailsDialog, {
      width: '960px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false,
      panelClass: 'customer-details-dialog', data: { appointmentId: appt.id },
    });
  }

  /** Without an appointment ("Add Appointment" / a free calendar slot): mobile lookup + personal details first,
   *  then the wizard for the new visit. `preset` fills the date and time of the slot that was clicked. */
  openWizard(appt?: FlowAppointmentRecord, preset?: NewAppointmentPreset): void {
    if (appt) return this.openWizardFor(appt.id);
    this.dialog.open(NewAppointmentDialog, {
      width: '760px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false, disableClose: true,
      panelClass: 'new-appointment-dialog', data: preset ?? null,
    }).afterClosed().subscribe((result?: NewAppointmentResult) => {
      if (!result) return;
      if (result.changed) this.loadAppointments();
      if (result.appointmentId && this.can('consultation-form')) this.openWizardFor(result.appointmentId);
    });
  }

  private openWizardFor(appointmentId: number): void {
    this.dialog.open(AppointmentWizard, {
      width: '880px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false, disableClose: true,
      panelClass: 'appointment-wizard-dialog', data: { appointmentId },
    }).afterClosed().subscribe((changed: boolean) => {
      if (changed) this.loadAppointments();
    });
  }

  /** Loads the tax invoice as a blob and opens it in a new tab (download / print from the browser's PDF viewer). */
  downloadInvoice(appt: FlowAppointmentRecord): void {
    const tab = window.open('', '_blank'); // opened before the request so the popup blocker allows it
    this.api.GET_BLOB(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${appt.id}/invoice`).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        tab?.close();
        this.toast.error('Could not open the invoice.');
      },
    });
  }

  private mapRow(a: FlowAppointmentRecord): TableRow {
    return {
      id: a.id,
      lead: { name: a.name, subtitle: a.customer?.customer_code ?? `AP-${String(a.id).padStart(5, '0')}` },
      contact: a.mobile_no,
      service: treatmentNames(a) ?? (a.category ? `${a.category} consultation` : 'Consultation'),
      branch: a.branch_name ?? a.branch?.name ?? '',
      schedule: `${this.formatDisplayDate(a.appointment_date)}, ${this.formatTime(a.appointment_time)}`,
      scheduleSort: `${a.appointment_date} ${a.appointment_time ?? ''}`,
      status: a.status,
      total: Number(a.total_amount) ? inr(a.total_amount) : '-',
      totalSort: Number(a.total_amount),
      paymentStatus: this.paymentStatus(a),
      actions: this.actionsFor(a),
    };
  }

  private refreshRows(): void {
    // Converted appointments have become customers: they are listed in Customer Management, not here.
    const filtered = this.appointments.filter(a => a.status !== 'Converted' && this.matchesBranch(a));
    const sorted = this.sortRows(filtered.map(a => this.mapRow(a)));

    this.totalRecords = sorted.length;
    const totalPages = Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    const start = (this.currentPage - 1) * this.pageSize;
    this.rows = sorted.slice(start, start + this.pageSize);
  }

  private sortRows(rows: TableRow[]): TableRow[] {
    const dir = this.sortDirection === 'desc' ? -1 : 1;
    const key = this.sortActive === 'schedule' ? 'scheduleSort' : this.sortActive === 'total' ? 'totalSort' : this.sortActive;
    const value = (row: TableRow) => {
      const v = row[key];
      if (key === 'lead') return String((v as any)?.name ?? '').toLowerCase();
      return typeof v === 'number' ? v : String(v ?? '').toLowerCase();
    };
    return [...rows].sort((l, r) => (value(l) < value(r) ? -dir : value(l) > value(r) ? dir : 0));
  }
}
