import { Injectable, computed, signal } from '@angular/core';

export type ScheduleStatus = 'Confirmed' | 'Pending' | 'Completed' | 'Cancelled';

export interface ScheduleEvent {
  id: string;
  customerName: string;
  phone: string;
  service: string;
  branch: string;
  staff: string;
  date: string;
  startTime: string;
  duration: number;
  status: ScheduleStatus;
}

export type NewScheduleEvent = Omit<ScheduleEvent, 'id'>;

/**
 * Single source of truth for scheduled visits, shared by the Schedule page's
 * calendar and anywhere else a visit can be booked (Follow-Ups' "Add Schedule"
 * action, etc.) so a visit created from either place shows up in both.
 */
@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  private readonly _events = signal<ScheduleEvent[]>(this.buildSeedEvents());

  readonly events = this._events.asReadonly();
  readonly count = computed(() => this._events().length);

  add(event: NewScheduleEvent): ScheduleEvent {
    const newEvent: ScheduleEvent = { id: `SCH-${Date.now()}`, ...event };
    this._events.update((list) => [...list, newEvent]);
    return newEvent;
  }

  confirm(id: string): void {
    this.patch(id, { status: 'Confirmed' });
  }

  cancel(id: string): void {
    this.patch(id, { status: 'Cancelled' });
  }

  reschedule(id: string, changes: Partial<NewScheduleEvent>): void {
    this.patch(id, { ...changes, status: 'Pending' });
  }

  private patch(id: string, changes: Partial<ScheduleEvent>): void {
    this._events.update((list) => list.map((event) => (event.id === id ? { ...event, ...changes } : event)));
  }

  private buildSeedEvents(): ScheduleEvent[] {
    const today = new Date();
    const weekStart = this.startOfWeek(today);
    const d = (dayIndex: number): string => this.toIso(this.addDays(weekStart, dayIndex));

    const seeds: NewScheduleEvent[] = [
      { customerName: 'Ananya Sharma', phone: '+91 98765 43210', service: 'Hair Loss Consultation', branch: 'Anna Nagar', staff: 'Priya Sharma', date: d(0), startTime: '10:00', duration: 45, status: 'Confirmed' },
      { customerName: 'Rahul Kumar', phone: '+91 91234 56780', service: 'Acne Treatment', branch: 'Velachery', staff: 'Karthik S', date: d(0), startTime: '14:00', duration: 30, status: 'Pending' },
      { customerName: 'Sneha Menon', phone: '+91 98867 66554', service: 'Anti-Aging Therapy', branch: 'Indiranagar', staff: 'Meera Nair', date: d(1), startTime: '09:30', duration: 60, status: 'Confirmed' },
      { customerName: 'Vikram Patel', phone: '+91 90123 45678', service: 'Dermatology Review', branch: 'Coimbatore', staff: 'Arun Kumar', date: d(1), startTime: '11:30', duration: 30, status: 'Completed' },
      { customerName: 'Neha Prasad', phone: '+91 93450 78920', service: 'Skin Rejuvenation', branch: 'Anna Nagar', staff: 'Priya Sharma', date: d(2), startTime: '10:00', duration: 45, status: 'Pending' },
      { customerName: 'Kavin Raj', phone: '+91 99520 13840', service: 'Laser Toning', branch: 'T Nagar', staff: 'Divya Raj', date: d(2), startTime: '10:15', duration: 30, status: 'Confirmed' },
      { customerName: 'Divya Bala', phone: '+91 90876 54321', service: 'Bridal Package', branch: 'Bengaluru', staff: 'Karthik S', date: d(2), startTime: '15:00', duration: 90, status: 'Confirmed' },
      { customerName: 'Arjun Nair', phone: '+91 91987 65432', service: 'Hair Loss Consultation', branch: 'Velachery', staff: 'Meera Nair', date: d(3), startTime: '12:00', duration: 45, status: 'Pending' },
      { customerName: 'Meera Iyer', phone: '+91 97654 32109', service: 'Acne Treatment', branch: 'Indiranagar', staff: 'Arun Kumar', date: d(4), startTime: '09:00', duration: 30, status: 'Confirmed' },
      { customerName: 'Suresh Babu', phone: '+91 96543 21098', service: 'Anti-Aging Therapy', branch: 'Coimbatore', staff: 'Priya Sharma', date: d(4), startTime: '16:00', duration: 60, status: 'Completed' },
      { customerName: 'Lakshmi Narayan', phone: '+91 95432 10987', service: 'Dermatology Review', branch: 'T Nagar', staff: 'Divya Raj', date: d(5), startTime: '11:00', duration: 30, status: 'Confirmed' },
      { customerName: 'Ganesh Prasad', phone: '+91 94321 09876', service: 'Skin Rejuvenation', branch: 'Anna Nagar', staff: 'Karthik S', date: d(5), startTime: '13:30', duration: 45, status: 'Pending' },
      { customerName: 'Priyanka Rao', phone: '+91 93210 98765', service: 'Laser Toning', branch: 'Bengaluru', staff: 'Meera Nair', date: d(6), startTime: '10:30', duration: 30, status: 'Cancelled' },
    ];

    return seeds.map((seed, index) => ({ id: `SCH-${1000 + index}`, ...seed }));
  }

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
}
