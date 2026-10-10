import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
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
import { FlowAppointmentRecord, FlowStatus, inr } from '../../shared/models/appointment-flow.model';
import { AppointmentWizard } from './appointment-wizard/appointment-wizard';
import { SittingsDialog } from './sittings-dialog/sittings-dialog';

const STATUSES: FlowStatus[] = ['Scheduled', 'In Consultation', 'Awaiting Terms', 'Invoiced', 'Converted', 'Cancelled'];

/**
 * Appointments booked by telecallers (a follow-up turned into a visit). Each one is worked through the
 * consultation wizard, then the invoice, then becomes a customer whose treatment sittings are tracked here.
 */
@Component({
  selector: 'app-appointment-page',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './appointment-page.html',
  styleUrl: './appointment-page.scss',
})
export class AppointmentPage implements OnInit, AfterViewInit {
  constructor(private dialog: MatDialog, private toast: ToastService, private api: ApiDataService) { }

  readonly inr = inr;

  filters: FilterOption[] = [
    { key: 'status', label: 'Status', options: STATUSES },
    { key: 'branch', label: 'Branch', multiSelect: true, options: [] },
    { key: 'date', label: 'Date' },
  ];

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
  rows: TableRow[] = [];
  loading = false;
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'schedule';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  today = new Date();
  timelineExpanded = typeof window === 'undefined' || window.matchMedia('(min-width: 576px)').matches;

  @ViewChild('timelineScroll') private timelineScrollRef?: ElementRef<HTMLDivElement>;
  canScrollTimelinePrev = false;
  canScrollTimelineNext = false;

  ngOnInit(): void {
    this.loadBranches();
    this.loadAppointments();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.updateTimelineScrollState());
  }

  // ---------------------------------------------------------------- data

  private loadBranches(): void {
    this.api.GET(`${ApiRoutesConstants.Branch_List_Options}?per_page=200`).subscribe({
      next: (res: any) => {
        const names = ((res?.data?.data ?? res?.data ?? []) as any[]).map(b => b?.name).filter(Boolean);
        this.filters = this.filters.map(f => (f.key === 'branch' ? { ...f, options: names } : f));
      },
      error: () => undefined,
    });
  }

  /** Status, date and search are filtered by the API; branch by name here. */
  loadAppointments(): void {
    this.loading = true;
    const params = new URLSearchParams({ per_page: '500' });
    if (this.filterState.status) params.set('status', this.filterState.status);
    if (this.filterState.dateFrom) params.set('date_from', this.filterState.dateFrom);
    if (this.filterState.dateTo) params.set('date_to', this.filterState.dateTo);
    if (this.searchTerm) params.set('search', this.searchTerm);

    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}?${params}`).subscribe({
      next: (res: any) => {
        this.appointments = res?.data?.data ?? [];
        this.loading = false;
        this.refreshRows();
        setTimeout(() => this.updateTimelineScrollState());
      },
      error: (err: any) => {
        this.loading = false;
        this.toast.error(err?.error?.message || 'Could not load appointments.');
      },
    });
  }

  // ---------------------------------------------------------------- timeline

  toggleTimeline(): void {
    this.timelineExpanded = !this.timelineExpanded;
    if (this.timelineExpanded) setTimeout(() => this.updateTimelineScrollState());
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateTimelineScrollState();
  }

  scrollTimeline(direction: 1 | -1): void {
    const el = this.timelineScrollRef?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: direction * Math.min(el.clientWidth * 0.9, 480), behavior: 'smooth' });
  }

  onTimelineScroll(): void {
    this.updateTimelineScrollState();
  }

  private updateTimelineScrollState(): void {
    const el = this.timelineScrollRef?.nativeElement;
    this.canScrollTimelinePrev = !!el && el.scrollLeft > 4;
    this.canScrollTimelineNext = !!el && el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
  }

  get todaysAppointments(): FlowAppointmentRecord[] {
    const today = this.toIso(this.today);
    return this.appointments
      .filter(a => a.appointment_date === today && a.status !== 'Cancelled')
      .sort((a, b) => (a.appointment_time ?? '').localeCompare(b.appointment_time ?? ''));
  }

  // ---------------------------------------------------------------- formatting

  private toIso(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

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

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  avatarColorForName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return `avatar-color-${(hash % 5) + 1}`;
  }

  statusClass(status: FlowStatus): string {
    const map: Record<FlowStatus, string> = {
      Scheduled: 'status-blue', 'In Consultation': 'status-orange', 'Awaiting Terms': 'status-orange',
      Invoiced: 'status-blue', Converted: 'status-green', Cancelled: 'status-red',
    };
    return map[status] ?? 'status-gray';
  }

  paymentStatus(a: FlowAppointmentRecord): 'Paid' | 'Partial' | 'Pending' {
    const total = Number(a.total_amount);
    const paid = Number(a.paid_amount);
    if (total > 0 && paid >= total) return 'Paid';
    return paid > 0 ? 'Partial' : 'Pending';
  }

  paymentStatusClass(status: 'Paid' | 'Partial' | 'Pending'): string {
    return status === 'Paid' ? 'status-green' : status === 'Partial' ? 'status-orange' : 'status-gray';
  }

  // ---------------------------------------------------------------- stats

  get stats(): DetailCardData[] {
    const today = this.todaysAppointments.length;
    const count = (s: FlowStatus) => this.appointments.filter(a => a.status === s).length;
    const converted = count('Converted');
    const total = this.appointments.length;
    const rate = total ? Math.round((converted / total) * 100) : 0;

    return [
      { label: "Today's Appointments", value: today, trendText: 'Visits booked for today', trendDirection: 'neutral', icon: 'bi-calendar-check', iconVariant: 'primary' },
      { label: 'Scheduled', value: count('Scheduled'), trendText: 'Waiting for consultation', trendDirection: 'neutral', icon: 'bi-clock-history', iconVariant: 'blue' },
      { label: 'In Progress', value: count('In Consultation') + count('Awaiting Terms') + count('Invoiced'), trendText: 'Consultation / terms / invoice', trendDirection: 'neutral', icon: 'bi-clipboard2-pulse', iconVariant: 'orange' },
      { label: 'Converted', value: converted, trendText: `${rate}% of appointments`, trendDirection: 'neutral', icon: 'bi-person-check', iconVariant: 'green' },
    ];
  }

  get formattedTodayDate(): string {
    return this.today.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
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
    if (a.status === 'Converted') {
      actions.push({ key: 'sittings', icon: 'bi-collection', label: 'Treatment sittings', variant: 'primary' });
    } else if (a.status !== 'Cancelled') {
      actions.push({ key: 'wizard', icon: 'bi-clipboard2-pulse', label: 'Consultation form', variant: 'primary' });
    }
    if (a.invoice_no) actions.push({ key: 'invoice', icon: 'bi-receipt', label: 'Download invoice', variant: 'default' });
    actions.push({ key: 'call', icon: 'bi-telephone', label: 'Call', variant: 'default' });
    return actions;
  }

  onQuickAction({ row, action }: { row: TableRow; action: string }): void {
    const appt = this.appointments.find(a => a.id === Number(row['id']));
    if (!appt) return;

    if (action === 'wizard') this.openWizard(appt);
    else if (action === 'sittings') this.openSittings(appt);
    else if (action === 'invoice') this.downloadInvoice(appt);
    else if (action === 'call') window.location.href = `tel:${appt.mobile_no}`;
  }

  openAppointmentProfile(row: TableRow): void {
    const appt = this.appointments.find(a => a.id === Number(row['id']));
    if (!appt) return;
    if (appt.status === 'Converted') this.openSittings(appt);
    else this.openWizard(appt);
  }

  openWizard(appt: FlowAppointmentRecord): void {
    this.dialog.open(AppointmentWizard, {
      width: '880px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false, disableClose: true,
      panelClass: 'appointment-wizard-dialog', data: { appointmentId: appt.id },
    }).afterClosed().subscribe((changed: boolean) => {
      if (changed) this.loadAppointments();
    });
  }

  openSittings(appt: FlowAppointmentRecord): void {
    this.dialog.open(SittingsDialog, {
      width: '960px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false,
      panelClass: 'sittings-dialog', data: { appointmentId: appt.id },
    }).afterClosed().subscribe(() => this.loadAppointments());
  }

  downloadInvoice(appt: FlowAppointmentRecord): void {
    this.api.GET_BLOB(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${appt.id}/invoice`).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${appt.invoice_no}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Could not download the invoice.'),
    });
  }

  private mapRow(a: FlowAppointmentRecord): TableRow {
    const payment = this.paymentStatus(a);
    return {
      id: a.id,
      lead: { name: a.name, subtitle: a.customer?.customer_code ?? `AP-${String(a.id).padStart(5, '0')}` },
      contact: a.mobile_no,
      service: a.treatment?.name ?? (a.category ? `${a.category} consultation` : 'Consultation'),
      branch: a.branch?.name ?? '',
      schedule: `${this.formatDisplayDate(a.appointment_date)}, ${this.formatTime(a.appointment_time)}`,
      scheduleSort: `${a.appointment_date} ${a.appointment_time ?? ''}`,
      status: a.status,
      total: Number(a.total_amount) ? inr(a.total_amount) : '-',
      totalSort: Number(a.total_amount),
      paymentStatus: Number(a.total_amount) ? payment : '-',
      actions: this.actionsFor(a),
    };
  }

  private refreshRows(): void {
    const branches = this.filterState.branch;
    const filtered = this.appointments.filter(a => !branches.length || branches.includes(a.branch?.name ?? ''));
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
