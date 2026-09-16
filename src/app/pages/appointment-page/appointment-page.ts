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
import { COMBO_OFFERS, PAYMENT_METHODS, PaymentStatus, TREATMENTS, formatCurrency, treatmentByName } from '../../shared/data/treatment-catalog';

export type AppointmentStatus = 'Confirmed' | 'Pending' | 'Completed' | 'Cancelled';

export interface Appointment {
  id: string;
  customerName: string;
  phone: string;
  gender: string;
  service: string;
  branch: string;
  staff: string;
  date: string;
  startTime: string;
  duration: number;
  status: AppointmentStatus;
  treatmentKeys: string[];
  comboKey: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  paymentMethod: string;
  amountPaid: number;
  paymentStatus: PaymentStatus;
}

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'confirm', icon: 'bi-check-lg', label: 'Confirm', variant: 'primary' },
  { key: 'reschedule', icon: 'bi-arrow-repeat', label: 'Reschedule', variant: 'default' },
  { key: 'cancel', icon: 'bi-x-lg', label: 'Cancel', variant: 'danger' },
];

@Component({
  selector: 'app-appointment-page',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './appointment-page.html',
  styleUrl: './appointment-page.scss',
})
export class AppointmentPage implements OnInit {
  constructor(private dialog: MatDialog, private toast: ToastService) { }

  readonly branches = ['Anna Nagar', 'Velachery', 'Indiranagar', 'Coimbatore', 'T Nagar', 'Bengaluru'];
  readonly staffOptions = ['Priya Sharma', 'Arun Kumar', 'Divya Raj', 'Karthik S', 'Meera Nair'];
  readonly treatments = TREATMENTS;
  readonly combos = COMBO_OFFERS;
  readonly formatCurrency = formatCurrency;

  filters: FilterOption[] = [
    { key: 'status', label: 'Status', options: ['Confirmed', 'Pending', 'Completed', 'Cancelled'] },
    { key: 'branch', label: 'Branch', multiSelect: true, options: this.branches },
    { key: 'telecaller', label: 'Staff', options: this.staffOptions },
    { key: 'date', label: 'Date' },
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
    { key: 'service', header: 'Treatment', type: 'text' },
    { key: 'branch', header: 'Branch', type: 'branch' },
    { key: 'schedule', header: 'Date & Time', type: 'text' },
    { key: 'staff', header: 'Staff', type: 'avatarGroup', sortable: false, width: '110px' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'total', header: 'Amount', type: 'text', width: '90px' },
    { key: 'paymentStatus', header: 'Payment', type: 'badge', width: '90px' },
    { key: 'actions', header: 'Actions', type: 'quickActions', sortable: false, width: '110px' },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];

  appointments: Appointment[] = [];

  rows: TableRow[] = [];
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'schedule';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  today = new Date();

  ngOnInit(): void {
    this.today = new Date();
    this.appointments = this.buildSeedAppointments();
    this.refreshRows();
  }

  // ---------------------------------------------------------------------
  // Date helpers
  // ---------------------------------------------------------------------

  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatDisplayDate(iso: string): string {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  formatTime(time: string): string {
    const [hh, mm] = time.split(':').map(Number);
    const period = hh >= 12 ? 'PM' : 'AM';
    const displayHour = hh % 12 === 0 ? 12 : hh % 12;
    return `${displayHour}:${String(mm).padStart(2, '0')} ${period}`;
  }

  // ---------------------------------------------------------------------
  // Today's timeline
  // ---------------------------------------------------------------------

  get todaysAppointments(): Appointment[] {
    const todayIso = this.toIso(this.today);
    return this.appointments
      .filter((appt) => appt.date === todayIso)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

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

  statusClass(status: AppointmentStatus): string {
    const map: Record<AppointmentStatus, string> = {
      Confirmed: 'status-green',
      Pending: 'status-orange',
      Completed: 'status-blue',
      Cancelled: 'status-red',
    };
    return map[status];
  }

  paymentStatusClass(status: PaymentStatus): string {
    const map: Record<PaymentStatus, string> = {
      Paid: 'status-green',
      Partial: 'status-orange',
      Pending: 'status-gray',
    };
    return map[status];
  }

  // ---------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------

  get stats(): DetailCardData[] {
    const todayIso = this.toIso(this.today);
    const today = this.appointments.filter((a) => a.date === todayIso);
    const confirmed = this.appointments.filter((a) => a.status === 'Confirmed');
    const pending = this.appointments.filter((a) => a.status === 'Pending');
    const completed = this.appointments.filter((a) => a.status === 'Completed');
    const total = this.appointments.length || 1;
    const completionRate = Math.round((completed.length / total) * 100);

    return [
      { label: "Today's Appointments", value: today.length, trendText: `${today.filter((a) => a.status === 'Confirmed').length} confirmed`, trendDirection: 'up' },
      { label: 'Confirmed', value: confirmed.length, trendText: 'Ready to visit', trendDirection: 'up' },
      { label: 'Pending', value: pending.length, trendText: 'Awaiting confirmation', trendDirection: 'neutral' },
      { label: 'Completion Rate', value: `${completionRate}%`, trendText: `${completed.length} completed overall`, trendDirection: 'up' },
    ];
  }

  // ---------------------------------------------------------------------
  // Table plumbing
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
      return 'Showing 0 appointments';
    }

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

  onQuickAction({ row, action }: { row: TableRow; action: string }): void {
    const id = row['id'] as string;
    const appt = this.appointments.find((a) => a.id === id);
    if (!appt) return;

    if (action === 'confirm') this.confirmAppointment(appt);
    else if (action === 'cancel') this.cancelAppointment(appt);
    else if (action === 'reschedule') this.rescheduleAppointment(appt);
  }

  private confirmAppointment(appt: Appointment): void {
    if (appt.status === 'Confirmed') {
      this.toast.info('Already confirmed', `${appt.customerName}'s appointment is already confirmed.`);
      return;
    }

    appt.status = 'Confirmed';
    this.toast.success('Appointment confirmed', `${appt.customerName} - ${this.formatDisplayDate(appt.date)}`);
    this.refreshRows();
  }

  private cancelAppointment(appt: Appointment): void {
    if (appt.status === 'Cancelled') return;

    appt.status = 'Cancelled';
    this.toast.warning('Appointment cancelled', `${appt.customerName} - ${this.formatDisplayDate(appt.date)}`);
    this.refreshRows();
  }

  private rescheduleAppointment(appt: Appointment): void {
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
        staffOptions: this.staffOptions,
        treatments: this.treatments,
        combos: this.combos,
        editMode: true,
        initial: {
          customerName: appt.customerName,
          phone: appt.phone,
          branch: appt.branch,
          staff: appt.staff,
          service: appt.service,
          date: appt.date,
          startTime: appt.startTime,
          duration: appt.duration,
          treatmentKeys: appt.treatmentKeys,
          comboKey: appt.comboKey,
          paymentMethod: appt.paymentMethod,
          amountPaid: appt.amountPaid,
        },
      },
    });

    dialogRef.afterClosed().subscribe((result: BookingFormResult | undefined) => {
      if (!result) return;

      Object.assign(appt, result, { status: 'Pending' as AppointmentStatus });
      this.toast.success('Appointment rescheduled', `${appt.customerName} moved to ${this.formatDisplayDate(appt.date)}`);
      this.refreshRows();
    });
  }

  openAddAppointment(): void {
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
        staffOptions: this.staffOptions,
        treatments: this.treatments,
        combos: this.combos,
      },
    });

    dialogRef.afterClosed().subscribe((result: BookingFormResult | undefined) => {
      if (!result) return;

      const newAppointment: Appointment = {
        id: `APT-${Date.now()}`,
        customerName: result.customerName,
        phone: result.phone,
        gender: '',
        service: result.service,
        branch: result.branch,
        staff: result.staff,
        date: result.date,
        startTime: result.startTime,
        duration: result.duration,
        status: 'Pending',
        treatmentKeys: result.treatmentKeys,
        comboKey: result.comboKey,
        subtotal: result.subtotal,
        discountAmount: result.discountAmount,
        total: result.total,
        paymentMethod: result.paymentMethod,
        amountPaid: result.amountPaid,
        paymentStatus: result.paymentStatus,
      };

      this.appointments = [newAppointment, ...this.appointments];
      this.currentPage = 1;
      this.toast.success('Appointment booked', `${newAppointment.customerName} - ${this.formatDisplayDate(newAppointment.date)}`);
      this.refreshRows();
    });
  }

  private mapAppointmentToRow(appt: Appointment, index: number): TableRow {
    return {
      id: appt.id,
      lead: {
        name: appt.customerName,
        subtitle: `APT-${String(1000 + index)}`,
      } as LeadCell,
      contact: appt.phone,
      service: appt.service,
      branch: appt.branch,
      schedule: `${this.formatDisplayDate(appt.date)}, ${this.formatTime(appt.startTime)}`,
      staff: [{ name: appt.staff, empNo: appt.staff }],
      status: appt.status,
      total: this.formatCurrency(appt.total),
      paymentStatus: appt.paymentStatus,
      actions: QUICK_ACTIONS,
    };
  }

  private refreshRows(): void {
    const filtered = this.getFilteredAppointments();
    const sorted = this.getSortedAppointments(filtered);

    this.totalRecords = sorted.length;

    const totalPages = Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;

    this.rows = sorted.slice(startIndex, endIndex).map((appt, i) => this.mapAppointmentToRow(appt, startIndex + i));
  }

  private getFilteredAppointments(): Appointment[] {
    return this.appointments.filter((appt) => {
      if (this.searchTerm) {
        const haystack = `${appt.customerName} ${appt.phone} ${appt.service}`.toLowerCase();
        if (!haystack.includes(this.searchTerm)) return false;
      }

      if (this.filterState.status && appt.status !== this.filterState.status) return false;
      if (this.filterState.branch.length > 0 && !this.filterState.branch.includes(appt.branch)) return false;
      if (this.filterState.telecaller && appt.staff !== this.filterState.telecaller) return false;
      if (this.filterState.dateFrom && appt.date < this.filterState.dateFrom) return false;
      if (this.filterState.dateTo && appt.date > this.filterState.dateTo) return false;

      return true;
    });
  }

  private getSortedAppointments(appointments: Appointment[]): Appointment[] {
    if (!this.sortActive || !this.sortDirection) {
      return appointments;
    }

    const direction = this.sortDirection === 'asc' ? 1 : -1;

    return [...appointments].sort((left, right) => {
      const leftValue = this.getSortableValue(left, this.sortActive);
      const rightValue = this.getSortableValue(right, this.sortActive);

      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return 1 * direction;
      return 0;
    });
  }

  private getSortableValue(appt: Appointment, key: string): string | number {
    if (key === 'lead') return appt.customerName.toLowerCase();
    if (key === 'contact') return appt.phone;
    if (key === 'schedule') return `${appt.date} ${appt.startTime}`;
    if (key === 'staff') return appt.staff.toLowerCase();

    const value = (appt as unknown as Record<string, unknown>)[key];
    if (typeof value === 'number') return value;
    return String(value ?? '').toLowerCase();
  }

  // ---------------------------------------------------------------------
  // Seed data
  // ---------------------------------------------------------------------

  private buildSeedAppointments(): Appointment[] {
    const addDays = (days: number): string => {
      const d = new Date(this.today);
      d.setDate(d.getDate() + days);
      return this.toIso(d);
    };

    type SeedAppointment = Omit<
      Appointment,
      'id' | 'treatmentKeys' | 'comboKey' | 'subtotal' | 'discountAmount' | 'total' | 'paymentMethod' | 'amountPaid' | 'paymentStatus'
    >;

    const seeds: SeedAppointment[] = [
      { customerName: 'Ananya Sharma', phone: '+91 98765 43210', gender: 'F', service: 'Hair Loss Consultation', branch: 'Anna Nagar', staff: 'Priya Sharma', date: addDays(0), startTime: '09:30', duration: 45, status: 'Confirmed' },
      { customerName: 'Rahul Kumar', phone: '+91 91234 56780', gender: 'M', service: 'Acne Treatment', branch: 'Velachery', staff: 'Karthik S', date: addDays(0), startTime: '11:00', duration: 30, status: 'Pending' },
      { customerName: 'Sneha Menon', phone: '+91 98867 66554', gender: 'F', service: 'Anti-Aging Therapy', branch: 'Indiranagar', staff: 'Meera Nair', date: addDays(0), startTime: '13:15', duration: 60, status: 'Confirmed' },
      { customerName: 'Vikram Patel', phone: '+91 90123 45678', gender: 'M', service: 'Dermatology Review', branch: 'Coimbatore', staff: 'Arun Kumar', date: addDays(0), startTime: '15:00', duration: 30, status: 'Completed' },
      { customerName: 'Neha Prasad', phone: '+91 93450 78920', gender: 'F', service: 'Skin Rejuvenation', branch: 'Anna Nagar', staff: 'Priya Sharma', date: addDays(0), startTime: '17:00', duration: 45, status: 'Cancelled' },
      { customerName: 'Kavin Raj', phone: '+91 99520 13840', gender: 'M', service: 'Laser Toning', branch: 'T Nagar', staff: 'Divya Raj', date: addDays(-1), startTime: '10:15', duration: 30, status: 'Completed' },
      { customerName: 'Divya Bala', phone: '+91 90876 54321', gender: 'F', service: 'Bridal Package', branch: 'Bengaluru', staff: 'Karthik S', date: addDays(-1), startTime: '14:00', duration: 90, status: 'Completed' },
      { customerName: 'Arjun Nair', phone: '+91 91987 65432', gender: 'M', service: 'Hair Loss Consultation', branch: 'Velachery', staff: 'Meera Nair', date: addDays(-2), startTime: '12:00', duration: 45, status: 'Cancelled' },
      { customerName: 'Meera Iyer', phone: '+91 97654 32109', gender: 'F', service: 'Acne Treatment', branch: 'Indiranagar', staff: 'Arun Kumar', date: addDays(1), startTime: '09:00', duration: 30, status: 'Confirmed' },
      { customerName: 'Suresh Babu', phone: '+91 96543 21098', gender: 'M', service: 'Anti-Aging Therapy', branch: 'Coimbatore', staff: 'Priya Sharma', date: addDays(1), startTime: '16:00', duration: 60, status: 'Pending' },
      { customerName: 'Lakshmi Narayan', phone: '+91 95432 10987', gender: 'F', service: 'Dermatology Review', branch: 'T Nagar', staff: 'Divya Raj', date: addDays(2), startTime: '11:00', duration: 30, status: 'Confirmed' },
      { customerName: 'Ganesh Prasad', phone: '+91 94321 09876', gender: 'M', service: 'Skin Rejuvenation', branch: 'Anna Nagar', staff: 'Karthik S', date: addDays(2), startTime: '13:30', duration: 45, status: 'Pending' },
      { customerName: 'Priyanka Rao', phone: '+91 93210 98765', gender: 'F', service: 'Laser Toning', branch: 'Bengaluru', staff: 'Meera Nair', date: addDays(3), startTime: '10:30', duration: 30, status: 'Confirmed' },
      { customerName: 'Manoj Verma', phone: '+91 92109 87654', gender: 'M', service: 'Bridal Package', branch: 'Velachery', staff: 'Arun Kumar', date: addDays(4), startTime: '15:30', duration: 90, status: 'Pending' },
      { customerName: 'Anitha Krishnan', phone: '+91 91098 76543', gender: 'F', service: 'Hair Loss Consultation', branch: 'Coimbatore', staff: 'Priya Sharma', date: addDays(5), startTime: '09:45', duration: 45, status: 'Confirmed' },
      { customerName: 'Deepak Chandran', phone: '+91 90987 65432', gender: 'M', service: 'Acne Treatment', branch: 'T Nagar', staff: 'Divya Raj', date: addDays(-3), startTime: '12:30', duration: 30, status: 'Completed' },
    ];

    return seeds.map((seed, index) => {
      const treatment = treatmentByName(seed.service);
      const subtotal = treatment?.price ?? 1000;
      // Every 5th booking got a small staff-applied discount, same as a real "Extra discount %" entry would.
      const discountAmount = index % 5 === 0 ? Math.round(subtotal * 0.1) : 0;
      const total = subtotal - discountAmount;

      let amountPaid: number;
      let paymentStatus: PaymentStatus;

      if (seed.status === 'Completed') {
        amountPaid = total;
        paymentStatus = 'Paid';
      } else if (seed.status === 'Cancelled') {
        amountPaid = 0;
        paymentStatus = 'Pending';
      } else if (seed.status === 'Confirmed') {
        amountPaid = index % 3 === 0 ? Math.round(total / 2) : total;
        paymentStatus = amountPaid >= total ? 'Paid' : 'Partial';
      } else {
        amountPaid = 0;
        paymentStatus = 'Pending';
      }

      return {
        id: `APT-${2000 + index}`,
        ...seed,
        treatmentKeys: treatment ? [treatment.key] : [],
        comboKey: null,
        subtotal,
        discountAmount,
        total,
        paymentMethod: PAYMENT_METHODS[index % PAYMENT_METHODS.length],
        amountPaid,
        paymentStatus,
      };
    });
  }
}
