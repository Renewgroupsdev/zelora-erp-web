import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { TreatmentHistory, inr } from '../../../shared/models/appointment-flow.model';
import { AppointmentWizard } from '../../appointment-page/appointment-wizard/appointment-wizard';

/** A Consultation Only (Nill Card) visit that can still be confirmed as a treatment. */
interface NillCard {
  appointment_id: number;
  visit_date: string;
  consultation_fee: number;
  is_free: boolean;
  total_amount: number;
  treatments: { name: string; sittings_count: number }[];
  can_start: boolean;
  mobile_no?: string | null;
  branch?: string | null;
  doctor?: string | null;
  doctor_suggestion?: string | null;
  paid_at?: string | null;
  transaction_no?: string | null;
}

interface LookupResult {
  is_customer: boolean;
  customer_code: string | null;
  name: string;
  email: string | null;
  gender: string | null;
  age: number | null;
  location: string | null;
  pincode: string | null;
  base_appointment_id: number | null;
  open_appointment_id?: number | null;
  open_status?: string | null;
  active_treatment_id: number | null;
  sitting_interval_days: number;
  treatments: TreatmentHistory[];
  nill_card: NillCard | null;
}

interface TreatmentOption { id: number; name: string; price: number; default_sittings: number; category_id: number }

/**
 * Customer Management -> "Add Treatment". Find the person by customer ID or mobile number; their details load and then
 *  - a converted customer gets another treatment (+ its sittings) on their record, and
 *  - a Nill Card person (only the consultation fee paid / free) confirms the treatment suggested at that visit, which
 *    reopens the consultation form at its Payment step so the sittings start once it is paid.
 * Closes with `true` when something changed (the customer list reloads).
 */
@Component({
  selector: 'app-add-treatment-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './add-treatment-dialog.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', '../../appointment-page/new-appointment-dialog/new-appointment-dialog.scss'],
})
export class AddTreatmentDialog implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<AddTreatmentDialog, boolean>);

  readonly inr = inr;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly categories = signal<{ id: number; name: string }[]>([]);
  readonly treatmentOptions = signal<TreatmentOption[]>([]);
  readonly looking = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  /** null = not searched yet, false = nobody found. */
  readonly found = signal<LookupResult | false | null>(null);

  readonly activePlan = computed(() => { const f = this.found(); return f ? f.treatments.find(t => t.status === 'active') ?? null : null; });
  readonly pastPlans = computed(() => { const f = this.found(); return f ? f.treatments.filter(t => t.status !== 'active') : []; });
  /** Converted customer with nothing in progress, or a Nill Card person who chose another treatment. */
  readonly canAddTreatment = computed(() => { const f = this.found(); return !!f && !!f.base_appointment_id && !this.activePlan(); });

  /** Nill Card with a treatment already suggested: carry on with it, or pick another one. */
  nillMode: 'continue' | 'change' = 'continue';
  query = '';
  plan = { category_id: null as number | null, treatment_id: null as number | null, sittings_count: 1, interval: 30, start_date: '', start_time: '', remarks: '' };

  ngOnInit(): void {
    this.plan.start_date = this.today;
    this.api.GetAllPages(ApiRoutesConstants.SERVICE_CATEGORY_TREE_LIST).subscribe({
      next: (cats: any[]) => {
        const active = cats.filter(c => c.is_active !== false);
        this.categories.set(active.map(c => ({ id: Number(c.id), name: c.name ?? '' })));
        this.treatmentOptions.set(active.flatMap(c => (c.treatments ?? [])
          .filter((t: any) => t.is_active !== false)
          .map((t: any) => ({ id: Number(t.id), name: t.name, price: Number(t.total_amount ?? 0), default_sittings: Number(t.default_sittings ?? 1), category_id: Number(c.id) }))));
      },
      error: () => this.treatmentOptions.set([]),
    });
  }

  // ---------------------------------------------------------------- find the person

  search(): void {
    const q = this.query.trim();
    this.error.set(null);
    if (!q) return void this.error.set('Enter the customer ID or the 10 digit mobile number.');
    const digits = q.replace(/\D/g, '');
    const byMobile = /^\d{10}$/.test(digits) && !/[a-z]/i.test(q);
    if (!byMobile && !/^[a-z]{2,}\d+$/i.test(q)) return void this.error.set('Enter a customer ID like CUST00004 or a 10 digit mobile number.');

    this.looking.set(true);
    const param = byMobile ? `mobile_no=${digits}` : `customer_code=${encodeURIComponent(q.toUpperCase())}`;
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW_LOOKUP}?${param}`)
      .pipe(finalize(() => this.looking.set(false)))
      .subscribe({
        next: (res: any) => {
          const r = (res?.data ?? null) as LookupResult | null;
          this.found.set(r ?? false);
          if (r) this.plan = { ...this.plan, interval: r.sitting_interval_days || 30 };
        },
        error: (err: any) => { this.found.set(false); this.error.set(err?.error?.message || 'Could not search.'); },
      });
  }

  onQueryChange(): void {
    this.nillMode = 'continue';
    if (this.found() !== null) this.found.set(null);
    this.error.set(null);
  }

  // ---------------------------------------------------------------- another treatment (converted customer)

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

  addTreatment(): void {
    const base = this.found() ? (this.found() as LookupResult).base_appointment_id : null;
    if (!base) return;
    if (!this.plan.treatment_id) return void this.error.set('Choose the treatment.');
    if (!(Number(this.plan.sittings_count) >= 1)) return void this.error.set('Sittings must be at least 1.');
    if (!this.plan.start_date || this.plan.start_date < this.today) return void this.error.set('Pick today or a later date for the first sitting.');
    this.error.set(null);
    this.saving.set(true);
    this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${base}/treatments`, {
      treatment_id: Number(this.plan.treatment_id),
      sittings_count: Number(this.plan.sittings_count),
      sitting_interval_days: Number(this.plan.interval) || 30,
      start_date: this.plan.start_date,
      start_time: this.plan.start_time ? this.plan.start_time.slice(0, 5) : null,
      remarks: this.plan.remarks || null,
    }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (res: any) => {
        this.changed = true;
        this.toast.success(res?.message || 'Treatment added.');
        this.plan = { ...this.plan, category_id: null, treatment_id: null, sittings_count: 1, remarks: '' };
        this.search(); // reload: the new treatment is now in progress
      },
      error: (err: any) => this.showError(err, 'Could not add the treatment.'),
    });
  }

  // ---------------------------------------------------------------- Nill Card -> confirmed treatment

  /**
   * Proceed with a Nill Card visit. step 4 = carry on with the suggested treatment (the consultation form opens at Payment);
   * step 3 = change the treatment (it opens at the Treatment step, then Payment). The consultation fee is already collected.
   */
  startNillCard(card: NillCard, step: 3 | 4): void {
    if (!this.auth.hasActionAccess('continue-consultation-form')) return void this.error.set('Your role cannot open the consultation form.');
    this.error.set(null);
    this.saving.set(true);
    this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${card.appointment_id}/resume-treatment`, { step })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res: any) => {
          this.toast.success(res?.message || 'Treatment started.');
          this.openForm(card.appointment_id);
        },
        error: (err: any) => this.showError(err, 'Could not start the treatment.'),
      });
  }

  /** Opens the consultation form of a visit (where it was left off). */
  openForm(appointmentId: number): void {
    if (!this.auth.hasActionAccess('continue-consultation-form')) return void this.error.set('Your role cannot open the consultation form.');
    this.dialogRef.close(true);
    this.dialog.open(AppointmentWizard, {
      width: '880px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false, disableClose: true,
      panelClass: 'appointment-wizard-dialog', data: { appointmentId },
    });
  }

  private changed = false;

  private showError(err: any, fallback: string): void {
    const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
    this.error.set(first || err?.error?.message || fallback);
  }

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
    this.dialogRef.close(this.changed);
  }
}
