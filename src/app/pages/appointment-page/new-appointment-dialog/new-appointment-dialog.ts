import { PhoneInput } from '../../../shared/directives/phone-input.directive';
import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { BranchOptionsService, parseUnitKey, unitKey } from '../../../shared/common-services/branch-options.service';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subscription, finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { HEARD_FROM, TreatmentHistory, inr } from '../../../shared/models/appointment-flow.model';

/** What the mobile lookup returns: personal details, plus the treatment history of a converted customer. */
interface LookupResult {
  is_customer: boolean;
  customer_code: string | null;
  name: string;
  email: string | null;
  gender: string | null;
  age: number | null;
  location: string | null;
  pincode: string | null;
  heard_from: string | null;
  branch_type: 'branch' | 'franchise' | null;
  branch_id: number | null;
  open_appointment_id: number | null;
  /** Set for a converted customer: new treatments / sittings go on this appointment, no new record is made. */
  base_appointment_id: number | null;
  active_treatment_id: number | null;
  sitting_interval_days: number;
  treatments: TreatmentHistory[];
}

interface TreatmentOption {
  id: number;
  name: string;
  price: number;
  default_sittings: number;
  category_id: number;
}

/** What the dialog closes with: a new appointment for the consultation wizard, or just "reload the list". */
/** The calendar slot that was clicked ("YYYY-MM-DD", "HH:mm"): the new booking starts at it. */
export interface NewAppointmentPreset {
  date: string;
  time: string;
}

export interface NewAppointmentResult {
  appointmentId?: number;
  changed?: boolean;
}

const emptyForm = () => ({
  name: '', email: '', gender: '', age: null as number | null, location: '', pincode: '', heard_from: '',
  /** "branch:9" / "franchise:7"; sent as branch_type + branch_id. */
  branch_key: '', appointment_date: '', appointment_time: '', doctor_id: '', notes: '',
});

/** One slot of the day (GET appointment-flow/slots); `reason` says why it can't be picked. */
interface DaySlot {
  time: string;
  available: boolean;
  reason: string | null;
}

interface FreeDoctor {
  id: number;
  name: string;
}

/**
 * "Add Appointment": enter the mobile number first.
 * - First visit (or not a customer yet): personal details + date / time -> a walk-in appointment for the consultation wizard.
 * - Converted customer: no new appointment record. The treatment in progress can get more sittings and its next
 *   sitting a new slot; with nothing in progress another treatment is started. Finished treatments are view only.
 */
@Component({
  selector: 'app-new-appointment-dialog',
  standalone: true,
  imports: [PhoneInput, CommonModule, FormsModule, MatDialogModule],
  templateUrl: './new-appointment-dialog.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', './new-appointment-dialog.scss'],
})
export class NewAppointmentDialog implements OnInit {
  private readonly branchOptions = inject(BranchOptionsService);
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = inject(MatDialogRef<NewAppointmentDialog, NewAppointmentResult | undefined>);
  private readonly preset = inject<NewAppointmentPreset | null>(MAT_DIALOG_DATA, { optional: true });

  readonly inr = inr;
  readonly heardFrom = HEARD_FROM;
  readonly today = toIsoDate(new Date());

  readonly branches = signal<{ key: string; name: string }[]>([]);
  readonly looking = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  /** Lookup outcome for the current number: null = not looked up yet, false = new customer. */
  readonly found = signal<LookupResult | false | null>(null);

  mobile = '';
  form = emptyForm();
  private lookedUp = '';
  private changed = false;

  ngOnInit(): void {
    const now = new Date();
    // Opened from a calendar slot: that slot; otherwise now.
    const date = this.preset?.date || this.today;
    // The time is picked from the slot grid; a clicked calendar slot is kept only if it is a free slot.
    const time = this.preset?.time || '';
    this.form.appointment_date = date;
    this.form.appointment_time = time;
    this.loadSlots();
    this.branchOptions.load().subscribe(list => this.branches.set(list.map(b => ({ key: b.key, name: b.name }))));
  }

  // ---------------------------------------------------------------- lookup

  /** Looks the number up as soon as it has 10 digits. */
  onMobileChange(value: string): void {
    this.mobile = (value ?? '').replace(/\D/g, '').slice(0, 10);
    if (this.mobile.length === 10) this.lookup();
    else if (this.lookedUp) this.reset();
  }

  lookup(force = false): void {
    if (this.mobile.length !== 10 || (!force && this.mobile === this.lookedUp)) return;
    this.lookedUp = this.mobile;
    if (!force) this.error.set(null);
    this.looking.set(true);
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW_LOOKUP}?mobile_no=${this.mobile}`)
      .pipe(finalize(() => this.looking.set(false)))
      .subscribe({
        next: (res: any) => this.applyLookup(res?.data ?? null),
        error: () => this.found.set(false),
      });
  }

  private applyLookup(r: LookupResult | null): void {
    this.found.set(r ?? false);
    if (!r) return;
    this.form = {
      ...this.form,
      name: r.name ?? '', email: r.email ?? '', gender: r.gender ?? '', age: r.age ?? null,
      location: r.location ?? '', pincode: r.pincode ?? '', heard_from: r.heard_from ?? '',
      branch_key: unitKey(r.branch_type, r.branch_id) || this.form.branch_key,
    };
    this.onUnitChange();
  }

  /** Number changed after a lookup: drop the details that belonged to the previous number. */
  private reset(): void {
    const { appointment_date, appointment_time, doctor_id, notes } = this.form;
    this.form = { ...emptyForm(), appointment_date, appointment_time, doctor_id, notes };
    this.found.set(null);
    this.lookedUp = '';
  }

  /** The number already has an appointment in progress - continue that one instead of a duplicate. */
  openExisting(id: number): void {
    this.dialogRef.close({ appointmentId: id, changed: this.changed });
  }

  // ---------------------------------------------------------------- first visit

  save(): void {
    this.error.set(null);
    if (this.mobile.length !== 10) return void this.error.set('Enter a 10 digit mobile number.');
    if (!this.form.name.trim()) return void this.error.set('Name is required.');
    if (this.form.pincode && !/^\d{6}$/.test(this.form.pincode)) return void this.error.set('Pincode must be 6 digits.');
    if (!this.form.appointment_date || !this.form.appointment_time) return void this.error.set('Pick the appointment date and time.');
    if (this.slotsLoading || this.doctorsLoading) return void this.error.set('Checking availability. Please wait a moment.');
    if (this.doctorsTotal !== 0 && !this.form.doctor_id) return void this.error.set(this.doctors.length ? 'Select an available doctor.' : 'No doctor is available at this time. Pick another time.');

    this.saving.set(true);
    const { branch_key, ...form } = this.form;
    const unit = parseUnitKey(branch_key);
    this.api.POST(ApiRoutesConstants.APPOINTMENT_FLOW, {
      ...form,
      branch_type: unit?.type ?? null,
      branch_id: unit?.id ?? null,
      name: this.form.name.trim(),
      mobile_no: this.mobile,
      email: this.form.email || null,
      gender: this.form.gender || null,
      location: this.form.location || null,
      pincode: this.form.pincode || null,
      heard_from: this.form.heard_from || null,
      notes: this.form.notes || null,
      appointment_time: this.form.appointment_time.slice(0, 5),
      doctor_id: this.form.doctor_id ? Number(this.form.doctor_id) : null,
    }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (res: any) => {
        this.toast.success(res?.message || 'Appointment created.');
        this.dialogRef.close({ appointmentId: Number(res.data.id), changed: true });
      },
      error: (err: any) => this.showError(err, 'Could not create the appointment.'),
    });
  }

  // ---------------------------------------------------------------- slots + doctors

  slots: DaySlot[] = [];
  slotsLoading = false;
  slotsError = '';
  slotMinutes = 45;
  doctors: FreeDoctor[] = [];
  /** How many doctors the unit has at all (null until a lookup finishes): "none free" vs "none set up". */
  doctorsTotal: number | null = null;
  doctorsLoading = false;
  doctorsError = '';
  private slotsSub?: Subscription;
  private doctorsSub?: Subscription;

  /** `&branch_type=..&branch_id=..` of the picked unit ('' = the signed-in user's own, which the server resolves). */
  private unitQuery(): string {
    const unit = parseUnitKey(this.form.branch_key);
    return unit ? `&branch_type=${unit.type}&branch_id=${unit.id}` : '';
  }

  /** Date picked / changed. */
  onDateChange(): void {
    this.form.appointment_time = '';
    this.activePart = '';
    this.loadSlots();
  }

  /** Branch / franchise picked: its doctors and bookings decide the slots. */
  onUnitChange(): void {
    this.loadSlots();
  }

  loadSlots(): void {
    this.slotsSub?.unsubscribe();
    const date = this.form.appointment_date;
    this.slots = [];
    this.slotsError = '';
    if (!date || date < this.today) {
      this.slotsLoading = false;
      this.resetDoctors();
      return;
    }
    this.slotsLoading = true;
    this.slotsSub = (this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/slots?date=${date}${this.unitQuery()}`) as Observable<any>)
      .pipe(finalize(() => (this.slotsLoading = false)))
      .subscribe({
        next: res => {
          this.slots = (res?.data ?? []) as DaySlot[];
          this.slotMinutes = Number(res?.meta?.slot_minutes ?? this.slotMinutes);
          const picked = this.form.appointment_time;
          if (picked && !this.slots.some(s => s.time === picked && s.available)) this.form.appointment_time = '';
          this.loadDoctors();
        },
        error: err => { this.slotsError = err?.error?.message || 'Could not load the appointment slots.'; this.resetDoctors(); },
      });
  }

  selectSlot(slot: DaySlot): void {
    if (!slot.available) return;
    this.form.appointment_time = this.form.appointment_time === slot.time ? '' : slot.time;
    this.loadDoctors();
  }

  private resetDoctors(): void {
    this.doctorsSub?.unsubscribe();
    this.doctors = [];
    this.doctorsTotal = null;
    this.doctorsError = '';
    this.doctorsLoading = false;
    this.form.doctor_id = '';
  }

  /** Doctors of the unit who are free at the picked date + time. */
  loadDoctors(): void {
    const { appointment_date: date, appointment_time: time } = this.form;
    this.resetDoctors();
    if (!date || !time) return;
    this.doctorsLoading = true;
    this.doctorsSub = (this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/available-doctors?date=${date}&time=${encodeURIComponent(time)}${this.unitQuery()}`) as Observable<any>)
      .pipe(finalize(() => (this.doctorsLoading = false)))
      .subscribe({
        next: res => {
          this.doctors = (res?.data ?? []) as FreeDoctor[];
          this.doctorsTotal = Number(res?.meta?.doctors ?? 0);
          if (this.doctors.length === 1) this.form.doctor_id = String(this.doctors[0].id);
        },
        error: err => { this.doctorsError = err?.error?.message || 'Could not load the available doctors.'; },
      });
  }

  get doctorPlaceholder(): string {
    if (!this.form.appointment_time) return 'Pick date and time first';
    if (this.doctorsLoading) return 'Checking availability…';
    if (this.doctorsError) return 'Could not load doctors';
    if (this.doctorsTotal === 0) return 'No doctor set up for this branch';
    if (!this.doctors.length) return 'No doctor available at this time';
    return 'Select available doctor';
  }

  get doctorHint(): string {
    if (!this.form.appointment_time || this.doctorsLoading) return '';
    if (this.doctorsError) return this.doctorsError;
    if (this.doctorsTotal === 0) return 'This branch / franchise has no doctor yet, so the visit is booked without one.';
    if (!this.doctors.length) return 'Every doctor here is booked or on leave at this time. Try another time.';
    return `${this.doctors.length} of ${this.doctorsTotal} doctor${this.doctorsTotal === 1 ? '' : 's'} available at ${this.slotLabel(this.form.appointment_time)}.`;
  }

  /** Slots grouped Morning / Afternoon / Evening, each with how many are still free. */
  get slotGroups(): { key: string; label: string; icon: string; range: string; slots: DaySlot[]; free: number }[] {
    const defs = [
      { key: 'morning', label: 'Morning', icon: 'bi-sunrise', from: 0, to: 12, range: 'Before 12 PM' },
      { key: 'afternoon', label: 'Afternoon', icon: 'bi-sun', from: 12, to: 16, range: '12 - 4 PM' },
      { key: 'evening', label: 'Evening', icon: 'bi-moon-stars', from: 16, to: 24, range: 'After 4 PM' },
    ];
    return defs
      // slots already past today are not offered at all (the count shows under the grid)
      .map(d => {
        const slots = this.slots.filter(s => s.reason !== 'Time has passed' && Number(s.time.slice(0, 2)) >= d.from && Number(s.time.slice(0, 2)) < d.to);
        return { key: d.key, label: d.label, icon: d.icon, range: d.range, slots, free: slots.filter(s => s.available).length };
      })
      .filter(g => g.slots.length);
  }

  /** Part of the day shown in the grid; until one is tapped, the part holding the picked slot, else the first with a free slot. */
  activePart = '';

  get activeGroup(): { key: string; label: string; icon: string; range: string; slots: DaySlot[]; free: number } | undefined {
    const groups = this.slotGroups;
    const picked = this.form.appointment_time;
    return groups.find(g => g.key === this.activePart)
      ?? groups.find(g => g.slots.some(s => s.time === picked))
      ?? groups.find(g => g.free > 0)
      ?? groups[0];
  }

  get passedSlotCount(): number {
    return this.slots.filter(s => s.reason === 'Time has passed').length;
  }

  get bookedSlotCount(): number {
    return this.slots.filter(s => !s.available && s.reason !== 'Time has passed').length;
  }

  get slotHint(): string {
    if (this.slotsError) return this.slotsError;
    if (!this.slots.length) return '';
    if (!this.slots.some(s => s.available)) return 'Every slot on this date is taken. Pick another date.';
    return `Each visit takes ${this.slotMinutes} minutes. Greyed slots are already booked or have no doctor free.`;
  }

  /** "11:15 AM - 12:00 PM" for the picked slot. */
  get selectedSlotRange(): string {
    const picked = this.form.appointment_time;
    if (!picked) return '';
    const [h, m] = picked.split(':').map(Number);
    const end = new Date(2000, 0, 1, h, m + this.slotMinutes);
    return `${this.slotLabel(picked)} - ${this.slotLabel(`${pad(end.getHours())}:${pad(end.getMinutes())}`)}`;
  }

  slotLabel(time: string): string {
    const [h, m] = time.split(':').map(Number);
    return `${pad(h % 12 || 12)}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  private showError(err: any, fallback: string): void {
    const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
    this.error.set(first || err?.error?.message || fallback);
  }

  // ---------------------------------------------------------------- shared

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatTime(t: string | null | undefined): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  close(): void {
    this.dialogRef.close(this.changed ? { changed: true } : undefined);
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
