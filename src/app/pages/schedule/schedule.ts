import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../shared/components/common-filter-card/common-filter-card';
import {
  BookingFormDialog,
  BookingFormResult,
} from '../../shared/components/booking-form-dialog/booking-form-dialog';
import {
  CommonFilterState,
  DetailCardData,
  FilterOption,
} from '../../shared/models/common-components.model';
import { ToastService } from '../../shared/common-services/toast.service';
import { TREATMENTS } from '../../shared/data/treatment-catalog';
import { ScheduleEvent, ScheduleService, ScheduleStatus } from '../../shared/common-services/schedule.service';

interface PositionedEvent {
  event: ScheduleEvent;
  style: { top: string; height: string; left: string; width: string };
  zIndex: number;
}

const RANGE_START_HOUR = 9;
const RANGE_END_HOUR = 20;
const ROW_HEIGHT = 52;
/** Each overlapping event cascades this many px to the right instead of splitting into equal, unreadably-narrow columns. */
const OVERLAP_STAGGER = 38;

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard],
  templateUrl: './schedule.html',
  styleUrl: './schedule.scss',
})
export class Schedule implements OnInit {
  constructor(private dialog: MatDialog, private toast: ToastService, private scheduleService: ScheduleService) { }

  readonly branches = ['Anna Nagar', 'Velachery', 'Indiranagar', 'Coimbatore', 'T Nagar', 'Bengaluru'];
  readonly staffOptions = ['Priya Sharma', 'Arun Kumar', 'Divya Raj', 'Karthik S', 'Meera Nair'];
  readonly treatments = TREATMENTS;

  readonly hours = Array.from({ length: RANGE_END_HOUR - RANGE_START_HOUR }, (_, i) => RANGE_START_HOUR + i);
  readonly rowHeight = ROW_HEIGHT;
  readonly calendarHeight = this.hours.length * ROW_HEIGHT;

  weekDays: Date[] = [];
  selectedDate = '';
  selectedEventId: string | null = null;
  today = new Date();

  private get events(): ScheduleEvent[] {
    return this.scheduleService.events();
  }

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

  private searchTerm = '';

  ngOnInit(): void {
    this.today = new Date();
    this.selectedDate = this.toIso(this.today);
    this.setWeek(this.startOfWeek(this.today));
  }

  // ---------------------------------------------------------------------
  // Week navigation
  // ---------------------------------------------------------------------

  private startOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private addDays(date: Date, amount: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + amount);
    return d;
  }

  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private setWeek(start: Date): void {
    this.weekDays = Array.from({ length: 7 }, (_, i) => this.addDays(start, i));
  }

  prevWeek(): void {
    this.setWeek(this.addDays(this.weekDays[0], -7));
  }

  nextWeek(): void {
    this.setWeek(this.addDays(this.weekDays[0], 7));
  }

  goToday(): void {
    const now = new Date();
    this.setWeek(this.startOfWeek(now));
    this.selectedDate = this.toIso(now);
  }

  get weekRangeLabel(): string {
    if (!this.weekDays.length) return '';
    const start = this.weekDays[0].toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const end = this.weekDays[6].toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${start} – ${end}`;
  }

  dayName(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  dateIso(date: Date): string {
    return this.toIso(date);
  }

  isToday(date: Date): boolean {
    return this.toIso(date) === this.toIso(this.today);
  }

  isSelectedDay(date: Date): boolean {
    return this.toIso(date) === this.selectedDate;
  }

  selectDay(date: Date): void {
    this.selectedDate = this.toIso(date);
  }

  // ---------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
  }

  onExport(): void {
    // Trigger export as needed.
  }

  get filteredEvents(): ScheduleEvent[] {
    return this.events.filter((event) => {
      if (this.searchTerm) {
        const haystack = `${event.customerName} ${event.phone} ${event.service}`.toLowerCase();
        if (!haystack.includes(this.searchTerm)) return false;
      }

      if (this.filterState.status && event.status !== this.filterState.status) return false;
      if (this.filterState.branch.length > 0 && !this.filterState.branch.includes(event.branch)) return false;
      if (this.filterState.telecaller && event.staff !== this.filterState.telecaller) return false;
      if (this.filterState.dateFrom && event.date < this.filterState.dateFrom) return false;
      if (this.filterState.dateTo && event.date > this.filterState.dateTo) return false;

      return true;
    });
  }

  // ---------------------------------------------------------------------
  // Calendar layout
  // ---------------------------------------------------------------------

  private toMinutes(time: string): number {
    const [hh, mm] = time.split(':').map(Number);
    return hh * 60 + mm;
  }

  eventsForDay(dateIso: string): ScheduleEvent[] {
    return this.filteredEvents
      .filter((event) => event.date === dateIso)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  layoutForDay(dateIso: string): PositionedEvent[] {
    const dayEvents = this.eventsForDay(dateIso);
    const columnsEnd: number[] = [];
    const placed: { event: ScheduleEvent; col: number }[] = [];

    for (const event of dayEvents) {
      const start = this.toMinutes(event.startTime);
      const end = start + event.duration;

      let col = columnsEnd.findIndex((endMinute) => endMinute <= start);
      if (col === -1) {
        col = columnsEnd.length;
        columnsEnd.push(end);
      } else {
        columnsEnd[col] = end;
      }

      placed.push({ event, col });
    }

    return placed.map(({ event, col }) => {
      const start = this.toMinutes(event.startTime);
      const top = ((start - RANGE_START_HOUR * 60) / 60) * this.rowHeight;
      const height = (event.duration / 60) * this.rowHeight;
      const offset = col * OVERLAP_STAGGER;

      // Compact (<= 30min) chips lay time + name on one row (see .event-chip.compact),
      // so they need far less height than the stacked time/name/service layout below.
      const minHeight = event.duration <= 30 ? 25 : 48;

      return {
        event,
        style: {
          top: `${top}px`,
          height: `${Math.max(height, minHeight)}px`,
          left: `${offset}px`,
          width: `calc(100% - ${offset}px)`,
        },
        zIndex: col + 1,
      };
    });
  }

  hourLabel(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour} ${period}`;
  }

  onEventClick(event: ScheduleEvent, date: Date): void {
    this.selectedDate = this.toIso(date);
    this.selectedEventId = event.id;
  }

  statusClass(status: ScheduleStatus): string {
    const map: Record<ScheduleStatus, string> = {
      Confirmed: 'status-green',
      Pending: 'status-orange',
      Completed: 'status-blue',
      Cancelled: 'status-red',
    };
    return map[status];
  }

  // ---------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------

  get todayEvents(): ScheduleEvent[] {
    return this.filteredEvents.filter((event) => event.date === this.toIso(this.today));
  }

  get weekEvents(): ScheduleEvent[] {
    if (!this.weekDays.length) return [];
    const startIso = this.toIso(this.weekDays[0]);
    const endIso = this.toIso(this.weekDays[6]);
    return this.filteredEvents.filter((event) => event.date >= startIso && event.date <= endIso);
  }

  get pendingCount(): number {
    return this.weekEvents.filter((event) => event.status === 'Pending').length;
  }

  get completedCount(): number {
    return this.weekEvents.filter((event) => event.status === 'Completed').length;
  }

  get stats(): DetailCardData[] {
    return [
      {
        label: "Today's Visits",
        value: this.todayEvents.length,
        trendText: `${this.todayEvents.filter((e) => e.status === 'Confirmed').length} confirmed`,
        trendDirection: 'up',
      },
      { label: 'This Week', value: this.weekEvents.length, trendText: this.weekRangeLabel, trendDirection: 'neutral' },
      { label: 'Pending Confirmation', value: this.pendingCount, trendText: 'Awaiting response', trendDirection: 'neutral' },
      { label: 'Completed', value: this.completedCount, trendText: 'Visits wrapped up', trendDirection: 'up' },
    ];
  }

  // ---------------------------------------------------------------------
  // Agenda quick actions
  // ---------------------------------------------------------------------

  get agendaLabel(): string {
    if (this.selectedDate === this.toIso(this.today)) return "Today's Schedule";
    const date = new Date(this.selectedDate);
    return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
  }

  get agendaEvents(): ScheduleEvent[] {
    return this.eventsForDay(this.selectedDate);
  }

  confirmVisit(event: ScheduleEvent): void {
    this.scheduleService.confirm(event.id);
    this.toast.success('Visit confirmed', `${event.customerName} - ${event.date}`);
  }

  cancelVisit(event: ScheduleEvent): void {
    this.scheduleService.cancel(event.id);
    this.toast.warning('Visit cancelled', `${event.customerName} - ${event.date}`);
  }

  rescheduleVisit(event: ScheduleEvent): void {
    const dialogRef = this.dialog.open(BookingFormDialog, {
      width: '640px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      panelClass: 'booking-form-dialog',
      data: {
        mode: 'schedule',
        branches: this.branches,
        staffOptions: this.staffOptions,
        treatments: this.treatments,
        editMode: true,
        initial: {
          customerName: event.customerName,
          phone: event.phone,
          branch: event.branch,
          staff: event.staff,
          service: event.service,
          date: event.date,
          startTime: event.startTime,
          duration: event.duration,
        },
      },
    });

    dialogRef.afterClosed().subscribe((result: BookingFormResult | undefined) => {
      if (!result) return;

      this.scheduleService.reschedule(event.id, {
        customerName: result.customerName,
        phone: result.phone,
        branch: result.branch,
        staff: result.staff,
        service: result.service,
        date: result.date,
        startTime: result.startTime,
        duration: result.duration,
      });

      this.selectedDate = result.date;
      this.toast.success('Visit rescheduled', `${result.customerName} moved to ${result.date}`);
    });
  }

  openAddSchedule(): void {
    const dialogRef = this.dialog.open(BookingFormDialog, {
      width: '640px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      panelClass: 'booking-form-dialog',
      data: {
        mode: 'schedule',
        branches: this.branches,
        staffOptions: this.staffOptions,
        treatments: this.treatments,
      },
    });

    dialogRef.afterClosed().subscribe((result: BookingFormResult | undefined) => {
      if (!result) return;

      const newEvent = this.scheduleService.add({
        customerName: result.customerName,
        phone: result.phone,
        service: result.service,
        branch: result.branch,
        staff: result.staff,
        date: result.date,
        startTime: result.startTime,
        duration: result.duration,
        status: 'Pending',
      });

      this.selectedDate = newEvent.date;
      this.toast.success('Schedule created', `${newEvent.customerName} added for ${newEvent.date}`);
    });
  }
}
