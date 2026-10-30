import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FlowAppointmentRecord, FlowStatus, treatmentNames } from '../../../shared/models/appointment-flow.model';

export type CalendarView = 'month' | 'week' | 'day';

/** Booking slot length - matches the API's appointments.slot_minutes. */
export const SLOT_MINUTES = 30;
/** Slot row height (px): Day view is taller so each booking shows its details. */
const SLOT_HEIGHT = { week: 30, day: 54 };
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 20;

/** Most bookings shown side by side in one slot; more than this collapse into one "N bookings" block. */
const MAX_SIDE_BY_SIDE = { week: 2, day: 4 };

/** A block on the slot grid: one booking, or (`group`) every booking of a crowded slot. */
interface PlacedBlock {
  key: string;
  appts: FlowAppointmentRecord[];
  group: boolean;
  /** Slot start (minutes from midnight). */
  minutes: number;
  top: number;
  height: number;
  left: number;
  width: number;
}

interface DayColumn {
  date: Date;
  iso: string;
  isToday: boolean;
  isPast: boolean;
  count: number;
  placed: PlacedBlock[];
}

/** What the slide-over panel shows: a slot's (or a single) bookings. */
export interface CalendarSelection {
  title: string;
  appointments: FlowAppointmentRecord[];
}

interface MonthCell {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  appts: FlowAppointmentRecord[];
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** First and last day the view shows (a month shows the 6 weeks around it), for loading only that range. */
export function calendarRange(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === 'day') return { from: anchor, to: anchor };
  if (view === 'week') {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
    return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6) };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const from = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 41) };
}

function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
}

/**
 * Appointment slot calendar. Month shows each day's bookings; Week / Day lay them out on a 30-minute slot grid
 * (overlapping bookings side by side). A free slot in the future books a new appointment at that date and time.
 */
@Component({
  selector: 'app-appointment-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './appointment-calendar.html',
  styleUrl: './appointment-calendar.scss',
})
export class AppointmentCalendar implements OnInit, OnDestroy {
  @Input() appointments: FlowAppointmentRecord[] = [];
  @Input() view: CalendarView = 'week';
  @Input() date = new Date();
  @Input() loading = false;
  /** Free slots are clickable only when the role may add appointments. */
  @Input() canBook = false;

  @Output() viewChange = new EventEmitter<CalendarView>();
  @Output() dateChange = new EventEmitter<Date>();
  @Output() slotSelect = new EventEmitter<{ date: string; time: string }>();
  @Output() appointmentsOpen = new EventEmitter<CalendarSelection>();

  readonly views: { key: CalendarView; label: string }[] = [
    { key: 'month', label: 'Month' },
    { key: 'week', label: 'Week' },
    { key: 'day', label: 'Day' },
  ];
  readonly weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  get slotHeight(): number {
    return this.view === 'day' ? SLOT_HEIGHT.day : SLOT_HEIGHT.week;
  }
  readonly treatmentNames = treatmentNames;

  now = new Date();
  private clock?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    // Keeps the "now" line and the past / bookable slots current.
    this.clock = setInterval(() => (this.now = new Date()), 60_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.clock);
  }

  // ---------------------------------------------------------------- navigation

  get title(): string {
    if (this.view === 'month') return this.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (this.view === 'day') return this.date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const { from, to } = calendarRange('week', this.date);
    const sameMonth = from.getMonth() === to.getMonth();
    const start = from.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const end = to.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
    return `${start} – ${end}, ${to.getFullYear()}`;
  }

  setView(view: CalendarView): void {
    if (view !== this.view) this.viewChange.emit(view);
  }

  shift(step: 1 | -1): void {
    const d = this.date;
    const next = this.view === 'month' ? new Date(d.getFullYear(), d.getMonth() + step, 1)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate() + step * (this.view === 'week' ? 7 : 1));
    this.dateChange.emit(next);
  }

  goToday(): void {
    this.dateChange.emit(new Date());
  }

  openDay(date: Date): void {
    this.dateChange.emit(date);
    this.viewChange.emit('day');
  }

  // ---------------------------------------------------------------- data per day

  private byDate(): Map<string, FlowAppointmentRecord[]> {
    const map = new Map<string, FlowAppointmentRecord[]>();
    for (const a of this.appointments) {
      const list = map.get(a.appointment_date) ?? [];
      list.push(a);
      map.set(a.appointment_date, list);
    }
    map.forEach(list => list.sort((l, r) => (l.appointment_time ?? '').localeCompare(r.appointment_time ?? '')));
    return map;
  }

  get monthCells(): MonthCell[] {
    const { from } = calendarRange('month', this.date);
    const byDate = this.byDate();
    const today = toIsoDate(this.now);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      const iso = toIsoDate(date);
      return { date, iso, inMonth: date.getMonth() === this.date.getMonth(), isToday: iso === today, appts: byDate.get(iso) ?? [] };
    });
  }

  /** Grid hours: 9 AM - 8 PM, stretched to fit any booking outside them. */
  private hourRange(days: string[], byDate: Map<string, FlowAppointmentRecord[]>): { start: number; end: number } {
    let start = DEFAULT_START_HOUR;
    let end = DEFAULT_END_HOUR;
    for (const iso of days) {
      for (const a of byDate.get(iso) ?? []) {
        const m = minutesOf(a.appointment_time);
        if (m === null) continue;
        start = Math.min(start, Math.floor(m / 60));
        end = Math.max(end, Math.ceil((m + SLOT_MINUTES) / 60));
      }
    }
    return { start, end: Math.min(24, end) };
  }

  /** Columns + slot rows for the week / day grid (computed once per change detection from one pass). */
  get grid(): { days: DayColumn[]; slots: { minutes: number; label: string; hourStart: boolean }[]; startMin: number; nowTop: number | null } {
    const { from, to } = calendarRange(this.view === 'day' ? 'day' : 'week', this.date);
    const isos: string[] = [];
    const dates: Date[] = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      dates.push(d);
      isos.push(toIsoDate(d));
    }

    const byDate = this.byDate();
    const { start, end } = this.hourRange(isos, byDate);
    const startMin = start * 60;
    const today = toIsoDate(this.now);

    const slots = [];
    for (let m = startMin; m < end * 60; m += SLOT_MINUTES) {
      slots.push({ minutes: m, label: m % 60 === 0 ? this.formatMinutes(m) : '', hourStart: m % 60 === 0 });
    }

    const days = dates.map((date, i) => ({
      date,
      iso: isos[i],
      isToday: isos[i] === today,
      isPast: isos[i] < today,
      count: byDate.get(isos[i])?.length ?? 0,
      placed: this.layout(isos[i], byDate.get(isos[i]) ?? [], startMin),
    }));

    const nowMin = this.now.getHours() * 60 + this.now.getMinutes();
    const nowTop = isos.includes(today) && nowMin >= startMin && nowMin <= end * 60
      ? ((nowMin - startMin) / SLOT_MINUTES) * this.slotHeight : null;

    return { days, slots, startMin, nowTop };
  }

  /**
   * Places one day's bookings slot by slot. A slot with a few bookings shows them side by side; a crowded one
   * (more than fit legibly) becomes a single "N bookings" block that opens them all in the side panel.
   */
  private layout(iso: string, list: FlowAppointmentRecord[], startMin: number): PlacedBlock[] {
    const rowHeight = this.slotHeight;
    const maxCols = this.view === 'day' ? MAX_SIDE_BY_SIDE.day : MAX_SIDE_BY_SIDE.week;

    const bySlot = new Map<number, FlowAppointmentRecord[]>();
    for (const appt of list) {
      const m = minutesOf(appt.appointment_time) ?? startMin;
      const slot = Math.floor(m / SLOT_MINUTES) * SLOT_MINUTES;
      bySlot.set(slot, [...(bySlot.get(slot) ?? []), appt]);
    }

    const placed: PlacedBlock[] = [];
    for (const [minutes, appts] of bySlot) {
      const top = ((minutes - startMin) / SLOT_MINUTES) * rowHeight;
      const base = { minutes, top, height: rowHeight - 2 };
      if (appts.length > maxCols) {
        placed.push({ ...base, key: `${iso}-${minutes}-group`, appts, group: true, left: 0, width: 100 });
        continue;
      }
      appts.forEach((appt, i) => placed.push({
        ...base, key: `${appt.id}`, appts: [appt], group: false, left: (i / appts.length) * 100, width: 100 / appts.length,
      }));
    }
    return placed;
  }

  /** Short status mix for a group block, e.g. "6 scheduled · 4 in progress". */
  groupSummary(appts: FlowAppointmentRecord[]): { cls: string; n: number }[] {
    const counts = new Map<string, number>();
    for (const a of appts) {
      const cls = this.statusClass(a.status);
      counts.set(cls, (counts.get(cls) ?? 0) + 1);
    }
    return [...counts].map(([cls, n]) => ({ cls, n }));
  }

  firstNames(appts: FlowAppointmentRecord[]): string {
    return appts.map(a => a.name.split(/\s+/)[0]).join(', ');
  }

  // ---------------------------------------------------------------- actions

  /** A slot can be booked when it has not started yet. */
  isBookable(day: DayColumn, minutes: number): boolean {
    if (!this.canBook || day.isPast) return false;
    return !day.isToday || minutes + SLOT_MINUTES > this.now.getHours() * 60 + this.now.getMinutes();
  }

  bookSlot(day: DayColumn, minutes: number): void {
    if (!this.isBookable(day, minutes)) return;
    this.slotSelect.emit({ date: day.iso, time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` });
  }

  /** Opens the side panel with these bookings, titled by their day and slot. */
  open(appts: FlowAppointmentRecord[], event?: Event): void {
    event?.stopPropagation();
    if (!appts.length) return;
    const first = appts[0];
    const day = new Date(`${first.appointment_date}T00:00:00`)
      .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const sameSlot = appts.every(a => a.appointment_time === first.appointment_time);
    this.appointmentsOpen.emit({
      title: sameSlot ? `${day} · ${this.formatTime(first.appointment_time)}` : day,
      appointments: appts,
    });
  }

  // ---------------------------------------------------------------- formatting

  formatMinutes(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h % 12 === 0 ? 12 : h % 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  formatTime(time: string | null | undefined): string {
    const m = minutesOf(time);
    return m === null ? '' : this.formatMinutes(m);
  }

  statusClass(status: FlowStatus): string {
    const map: Record<FlowStatus, string> = {
      Scheduled: 'ev-blue', 'In Consultation': 'ev-orange', 'Awaiting Terms': 'ev-orange',
      Invoiced: 'ev-purple', Converted: 'ev-green', 'Consultation Only': 'ev-gray', Cancelled: 'ev-red',
    };
    return map[status] ?? 'ev-gray';
  }

  tooltip(a: FlowAppointmentRecord): string {
    const service = treatmentNames(a) || (a.category ? `${a.category} consultation` : 'Consultation');
    return [`${this.formatTime(a.appointment_time)} · ${a.name}`, a.mobile_no, service, a.branch_name ?? a.branch?.name ?? '', a.status]
      .filter(Boolean).join('\n');
  }
}
