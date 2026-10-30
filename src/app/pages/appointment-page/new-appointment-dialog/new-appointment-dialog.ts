import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { BranchOptionsService, parseUnitKey, unitKey } from '../../../shared/common-services/branch-options.service';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
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
  branch_key: '', appointment_date: '', appointment_time: '', notes: '',
});

/**
 * "Add Appointment": enter the mobile number first.
 * - First visit (or not a customer yet): personal details + date / time -> a walk-in appointment for the consultation wizard.
 * - Converted customer: no new appointment record. The treatment in progress can get more sittings and its next
 *   sitting a new slot; with nothing in progress another treatment is started. Finished treatments are view only.
 */
@Component({
  selector: 'app-new-appointment-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, CanActionDirective],
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
  readonly categories = signal<{ id: number; name: string }[]>([]);
  readonly treatmentOptions = signal<TreatmentOption[]>([]);
  readonly looking = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  /** Lookup outcome for the current number: null = not looked up yet, false = new customer. */
  readonly found = signal<LookupResult | false | null>(null);

  /** Converted customer -> the treatment screen instead of the new appointment form. */
  readonly returning = computed(() => {
    const f = this.found();
    return f && f.base_appointment_id ? f : null;
  });
  readonly activePlan = computed(() => this.returning()?.treatments.find(t => t.status === 'active') ?? null);
  readonly pastPlans = computed(() => this.returning()?.treatments.filter(t => t.status !== 'active') ?? []);
  /** The next sitting still to happen on the active treatment - its slot can be changed here. */
  readonly nextSitting = computed(() => this.activePlan()?.sittings.find(s => s.status !== 'completed') ?? null);

  mobile = '';
  form = emptyForm();
  /** Returning customer: more sittings on the treatment in progress. */
  extra = { count: 1, interval: 30 };
  /** Returning customer: the next sitting's new slot. */
  slot = { date: '', time: '' };
  /** Returning customer with nothing in progress: another treatment. */
  plan = { category_id: null as number | null, treatment_id: null as number | null, sittings_count: 1, interval: 30, start_date: '', start_time: '', remarks: '' };
  private lookedUp = '';
  private changed = false;

  ngOnInit(): void {
    const now = new Date();
    // Opened from a calendar slot: that slot; otherwise now.
    const date = this.preset?.date || this.today;
    const time = this.preset?.time || `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    this.form.appointment_date = date;
    this.form.appointment_time = time;
    this.plan.start_date = date;
    this.plan.start_time = time;
    if (this.preset) this.slot = { date, time };
    this.branchOptions.load().subscribe(list => this.branches.set(list.map(b => ({ key: b.key, name: b.name }))));
    this.api.GetAllPages(ApiRoutesConstants.SERVICE_CATEGORY_TREE_LIST).subscribe({
      next: (cats: any[]) => {
        const active = cats.filter(c => c.is_active !== false);
        this.categories.set(active.map(c => ({ id: Number(c.id), name: c.name ?? '' })));
        this.treatmentOptions.set(active.flatMap(c => (c.treatments ?? [])
          .filter((t: any) => t.is_active !== false)
          .map((t: any) => ({
            id: Number(t.id), name: t.name, price: Number(t.total_amount ?? 0), default_sittings: Number(t.default_sittings ?? 1), category_id: Number(c.id),
          }))));
      },
      error: () => this.treatmentOptions.set([]),
    });
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
    const interval = r.sitting_interval_days || 30;
    this.extra = { count: 1, interval };
    this.plan = { ...this.plan, interval };
    const next = this.nextSitting();
    // A slot clicked on the calendar wins over the sitting's current one.
    this.slot = this.preset ? { date: this.preset.date, time: this.preset.time }
      : { date: next?.scheduled_date ?? '', time: (next?.scheduled_time ?? '').slice(0, 5) };
  }

  /** Number changed after a lookup: drop the details that belonged to the previous number. */
  private reset(): void {
    const { appointment_date, appointment_time, notes } = this.form;
    this.form = { ...emptyForm(), appointment_date, appointment_time, notes };
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
    }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (res: any) => {
        this.toast.success(res?.message || 'Appointment created.');
        this.dialogRef.close({ appointmentId: Number(res.data.id), changed: true });
      },
      error: (err: any) => this.showError(err, 'Could not create the appointment.'),
    });
  }

  // ---------------------------------------------------------------- returning customer

  get filteredTreatments(): TreatmentOption[] {
    const all = this.treatmentOptions();
    return this.plan.category_id ? all.filter(t => t.category_id === Number(this.plan.category_id)) : all;
  }

  get selectedTreatment(): TreatmentOption | undefined {
    return this.treatmentOptions().find(t => t.id === Number(this.plan.treatment_id));
  }

  get newPlanTotal(): number {
    return Math.round((this.selectedTreatment?.price ?? 0) * (Number(this.plan.sittings_count) || 0) * 100) / 100;
  }

  onCategoryChange(): void {
    if (this.selectedTreatment && this.selectedTreatment.category_id !== Number(this.plan.category_id)) this.plan.treatment_id = null;
  }

  onTreatmentChange(): void {
    const t = this.selectedTreatment;
    if (!t) return;
    this.plan.sittings_count = t.default_sittings || 1;
    if (!this.plan.category_id) this.plan.category_id = t.category_id;
  }

  /** Moves the next sitting of the treatment in progress. */
  saveSlot(): void {
    const next = this.nextSitting();
    if (!next) return;
    if (!this.slot.date || this.slot.date < this.today) return void this.error.set('Pick today or a later date for the next sitting.');
    this.run(this.api.PUT(`${ApiRoutesConstants.SITTINGS}/${next.id}/reschedule`, {
      scheduled_date: this.slot.date, scheduled_time: this.slot.time ? this.slot.time.slice(0, 5) : null,
    }), 'Sitting rescheduled.');
  }

  addSittings(): void {
    const active = this.activePlan();
    if (!active) return;
    const count = Number(this.extra.count);
    if (!(count >= 1 && count <= 50)) return void this.error.set('Add between 1 and 50 sittings.');
    if (!(Number(this.extra.interval) >= 1)) return void this.error.set('The gap between sittings must be at least 1 day.');
    this.run(this.api.POST(`${ApiRoutesConstants.CUSTOMER_TREATMENTS}/${active.id}/sittings`, {
      count, sitting_interval_days: Number(this.extra.interval),
    }));
  }

  addTreatment(): void {
    const base = this.returning()?.base_appointment_id;
    if (!base) return;
    if (!this.plan.treatment_id) return void this.error.set('Choose the treatment.');
    if (!(Number(this.plan.sittings_count) >= 1)) return void this.error.set('Sittings must be at least 1.');
    if (!this.plan.start_date || this.plan.start_date < this.today) return void this.error.set('Pick today or a later date for the first sitting.');
    this.run(this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${base}/treatments`, {
      treatment_id: Number(this.plan.treatment_id),
      sittings_count: Number(this.plan.sittings_count),
      sitting_interval_days: Number(this.plan.interval) || 30,
      start_date: this.plan.start_date,
      start_time: this.plan.start_time ? this.plan.start_time.slice(0, 5) : null,
      remarks: this.plan.remarks || null,
    }), undefined, () => (this.plan = { ...this.plan, category_id: null, treatment_id: null, sittings_count: 1, remarks: '' }));
  }

  /** Saves a returning-customer change, then reloads the customer's treatments. */
  private run(request: any, fallbackMessage = 'Saved.', after?: () => void): void {
    this.error.set(null);
    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (res: any) => {
        this.changed = true;
        this.toast.success(res?.message || fallbackMessage);
        after?.();
        this.lookup(true);
      },
      error: (err: any) => this.showError(err, 'Could not save.'),
    });
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
