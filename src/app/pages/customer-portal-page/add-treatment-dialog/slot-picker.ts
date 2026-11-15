import { Observable, Subscription, finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';

export interface DaySlot { time: string; available: boolean; reason: string | null }
export interface FreeDoctor { id: number; name: string }
export interface SlotGroup { key: string; label: string; icon: string; range: string; slots: DaySlot[]; free: number }

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Slot + doctor picker state, same behaviour as the "Add Appointment" dialog: the day's slots grouped Morning / Afternoon /
 * Evening (GET appointment-flow/slots), then the doctors free at the picked slot (GET appointment-flow/available-doctors).
 */
export class SlotPicker {
  slots: DaySlot[] = [];
  loading = false;
  error = '';
  slotMinutes = 45;
  activePart = '';
  time = '';
  date = '';

  doctors: FreeDoctor[] = [];
  doctorsTotal: number | null = null;
  doctorsLoading = false;
  doctorsError = '';
  doctorId: number | null = null;

  private slotsSub?: Subscription;
  private doctorsSub?: Subscription;

  /** `unit` gives the `&branch_type=..&branch_id=..` query of the customer's branch ('' = the signed-in user's own). */
  constructor(private readonly api: ApiDataService, private readonly today: string, private readonly unit: () => string) {}

  /** Date picked / changed (or the customer reloaded): fetch that day's slots; the picked time is dropped if it is no longer free. */
  setDate(date: string): void {
    this.date = date;
    this.slotsSub?.unsubscribe();
    this.slots = [];
    this.error = '';
    this.activePart = '';
    if (!date || date < this.today) { this.loading = false; this.time = ''; this.resetDoctors(); return; }
    this.loading = true;
    this.slotsSub = (this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/slots?date=${date}${this.unit()}`) as Observable<any>)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: res => {
          this.slots = (res?.data ?? []) as DaySlot[];
          this.slotMinutes = Number(res?.meta?.slot_minutes ?? this.slotMinutes);
          if (this.time && !this.slots.some(s => s.time === this.time && s.available)) this.time = '';
          this.loadDoctors();
        },
        error: err => { this.error = err?.error?.message || 'Could not load the appointment slots.'; this.time = ''; this.resetDoctors(); },
      });
  }

  select(slot: DaySlot): void {
    if (!slot.available) return;
    this.time = this.time === slot.time ? '' : slot.time;
    this.loadDoctors();
  }

  clear(): void { this.time = ''; this.loadDoctors(); }

  reset(): void {
    this.slotsSub?.unsubscribe();
    this.slots = []; this.time = ''; this.date = ''; this.error = ''; this.activePart = ''; this.loading = false;
    this.resetDoctors();
  }

  private resetDoctors(): void {
    this.doctorsSub?.unsubscribe();
    this.doctors = []; this.doctorsTotal = null; this.doctorsError = ''; this.doctorsLoading = false; this.doctorId = null;
  }

  private loadDoctors(): void {
    this.resetDoctors();
    if (!this.date || !this.time) return;
    this.doctorsLoading = true;
    this.doctorsSub = (this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/available-doctors?date=${this.date}&time=${encodeURIComponent(this.time)}${this.unit()}`) as Observable<any>)
      .pipe(finalize(() => (this.doctorsLoading = false)))
      .subscribe({
        next: res => {
          this.doctors = (res?.data ?? []) as FreeDoctor[];
          this.doctorsTotal = Number(res?.meta?.doctors ?? 0);
          if (this.doctors.length === 1) this.doctorId = this.doctors[0].id;
        },
        error: err => { this.doctorsError = err?.error?.message || 'Could not load the available doctors.'; },
      });
  }

  get groups(): SlotGroup[] {
    const defs = [
      { key: 'morning', label: 'Morning', icon: 'bi-sunrise', from: 0, to: 12, range: 'Before 12 PM' },
      { key: 'afternoon', label: 'Afternoon', icon: 'bi-sun', from: 12, to: 16, range: '12 - 4 PM' },
      { key: 'evening', label: 'Evening', icon: 'bi-moon-stars', from: 16, to: 24, range: 'After 4 PM' },
    ];
    return defs
      .map(d => {
        const slots = this.slots.filter(s => s.reason !== 'Time has passed' && Number(s.time.slice(0, 2)) >= d.from && Number(s.time.slice(0, 2)) < d.to);
        return { key: d.key, label: d.label, icon: d.icon, range: d.range, slots, free: slots.filter(s => s.available).length };
      })
      .filter(g => g.slots.length);
  }

  get activeGroup(): SlotGroup | undefined {
    const groups = this.groups;
    return groups.find(g => g.key === this.activePart)
      ?? groups.find(g => g.slots.some(s => s.time === this.time))
      ?? groups.find(g => g.free > 0)
      ?? groups[0];
  }

  get passedCount(): number { return this.slots.filter(s => s.reason === 'Time has passed').length; }
  get bookedCount(): number { return this.slots.filter(s => !s.available && s.reason !== 'Time has passed').length; }

  get hint(): string {
    if (this.error) return this.error;
    if (!this.slots.length) return '';
    if (!this.slots.some(s => s.available)) return 'Every slot on this date is taken. Pick another date.';
    return `Each visit takes ${this.slotMinutes} minutes. Greyed slots are already booked or have no doctor free.`;
  }

  get range(): string {
    if (!this.time) return '';
    const [h, m] = this.time.split(':').map(Number);
    const end = new Date(2000, 0, 1, h, m + this.slotMinutes);
    return `${this.label(this.time)} - ${this.label(`${pad(end.getHours())}:${pad(end.getMinutes())}`)}`;
  }

  label(time: string): string {
    const [h, m] = time.split(':').map(Number);
    return `${pad(h % 12 || 12)}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  get doctorPlaceholder(): string {
    if (!this.time) return 'Pick date and time first';
    if (this.doctorsLoading) return 'Checking availability…';
    if (this.doctorsError) return 'Could not load doctors';
    if (this.doctorsTotal === 0) return 'No doctor set up for this branch';
    if (!this.doctors.length) return 'No doctor available at this time';
    return 'Select available doctor';
  }

  get doctorHint(): string {
    if (!this.time || this.doctorsLoading) return '';
    if (this.doctorsError) return this.doctorsError;
    if (this.doctorsTotal === 0) return 'This branch has no doctor yet, so the sittings are scheduled without one.';
    if (!this.doctors.length) return 'Every doctor here is booked or on leave at this time. Try another time.';
    return `${this.doctors.length} of ${this.doctorsTotal} doctor${this.doctorsTotal === 1 ? '' : 's'} available at ${this.label(this.time)}.`;
  }
}
