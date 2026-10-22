import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { HairGradeIcon } from '../../../shared/components/hair-grade-icon/hair-grade-icon';
import {
  ALLERGIES, DiscountType, EMI_MONTHS, FAMILY_HISTORY, FlowAppointmentRecord, FlowDocument, HAIR_LOSS_PATTERN, HEARD_FROM, LUDWIG_GRADES,
  NORWOOD_GRADES, PAYMENT_MODES, PaymentMode, SKIN_CONCERNS, SKIN_TYPES, inr,
} from '../../../shared/models/appointment-flow.model';
import { PageLoader } from '../../../shared/components/page-loader/page-loader';

interface TreatmentOption {
  id: number;
  name: string;
  total_amount: number;
  default_sittings: number;
  category: string;
  category_id: number;
}

/** One treatment row of the Treatment step. */
interface PlanLine {
  treatment_id: number | null;
  sittings_count: number;
  sitting_interval_days: number;
}

const MAX_TREATMENTS = 10;
const blankLine = (): PlanLine => ({ treatment_id: null, sittings_count: 1, sitting_interval_days: 30 });

/** Which clinical examination sections a service category needs. */
type ExamKind = 'Hair' | 'Skin' | 'Combo' | 'Other';

/** A service category from Service Category master, listed in the "Service Category" dropdown. */
interface CategoryOption {
  id: number;
  name: string;
  /** Hair / Skin / Combo (both) / Other (no hair or skin section, e.g. Slimming). */
  kind: ExamKind;
  icon: string;
}

/** Answers of the printed consultation form, stored as `appointments.consultation`. */
interface Consultation {
  familyHistory: string;
  familyHistoryOther: string;
  personalHistory: string;
  drugHistory: string;
  cosmeticProcedures: 'Negative' | 'Positive' | '';
  cosmeticDetails: string;
  // Hair
  lossPattern: string[];
  scalpExam: string;
  feltExam: string;
  partWidth: string;
  hairPull: { frontal: number | null; occipital: number | null; lesional: number | null };
  hairFeathering: 'Normal' | 'Abnormal' | '';
  grade: string;
  // Skin
  skinType: string;
  concerns: string[];
  concernsOther: string;
  dermatologist: 'Yes' | 'No' | '';
  dermatologistDetails: string;
  allergies: string[];
  allergiesOther: string;
  retinoids: string;
  botox: 'Yes' | 'No' | '';
  botoxDetails: string;
}

const emptyConsultation = (): Consultation => ({
  familyHistory: '', familyHistoryOther: '', personalHistory: '', drugHistory: '', cosmeticProcedures: '', cosmeticDetails: '',
  lossPattern: [], scalpExam: '', feltExam: '', partWidth: '', hairPull: { frontal: null, occipital: null, lesional: null },
  hairFeathering: '', grade: '',
  skinType: '', concerns: [], concernsOther: '', dermatologist: '', dermatologistDetails: '', allergies: [], allergiesOther: '',
  retinoids: '', botox: '', botoxDetails: '',
});

/**
 * Consultation wizard for a booked appointment. Each "Next" saves its step to the API:
 * 1 profile + patient history documents, 2 clinical examination (gender & Hair / Skin), 3 treatment x sittings,
 * 4 payment (sends the T&C SMS), 5 terms accepted -> invoice -> convert to customer.
 */
@Component({
  selector: 'app-appointment-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, HairGradeIcon, PageLoader],
  templateUrl: './appointment-wizard.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', './appointment-wizard.scss'],
})
export class AppointmentWizard implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = inject(MatDialogRef<AppointmentWizard, boolean>);
  private readonly data = inject<{ appointmentId: number }>(MAT_DIALOG_DATA);

  private readonly auth = inject(AuthService);

  /** Each step is a Roles & Permissions action of the Appointment module (seeded from config/module_actions.php):
   *  a role only sees the steps ticked for it, under the name set there. */
  private static readonly STEP_DEFS = [
    { slug: 'consultation-profile-history', label: 'Profile & History', icon: 'bi-person-vcard' },
    { slug: 'consultation-clinical-examination', label: 'Clinical Examination', icon: 'bi-clipboard2-pulse' },
    { slug: 'consultation-treatment', label: 'Treatment', icon: 'bi-capsule' },
    { slug: 'consultation-payment', label: 'Payment', icon: 'bi-credit-card' },
    { slug: 'consultation-terms-invoice', label: 'Terms & Invoice', icon: 'bi-receipt' },
  ];

  readonly steps = computed(() => AppointmentWizard.STEP_DEFS.map((def, index) => ({
    index,
    icon: def.icon,
    label: this.auth.actionName(def.slug, def.label),
    // The API only sends the actions a role is ticked for, so a step missing from the list is denied.
    allowed: this.auth.hasActionAccess(def.slug),
  })));

  /** The closest step the role may open, moving in `direction` from `from` (stays put when there is none). */
  private allowedStep(from: number, direction: 1 | -1): number {
    for (let i = from + direction; i >= 0 && i <= 4; i += direction) {
      if (this.steps()[i].allowed) return i;
    }
    return from;
  }

  readonly hasPrevStep = computed(() => this.allowedStep(this.step(), -1) !== this.step());
  readonly hasNextStep = computed(() => this.allowedStep(this.step(), 1) !== this.step());

  readonly inr = inr;
  readonly heardFrom = HEARD_FROM;
  readonly familyHistoryOptions = FAMILY_HISTORY;
  readonly lossPatterns = HAIR_LOSS_PATTERN;
  readonly skinTypes = SKIN_TYPES;
  readonly skinConcerns = SKIN_CONCERNS;
  readonly allergyOptions = ALLERGIES;
  readonly paymentModes = PAYMENT_MODES;
  readonly emiMonths = EMI_MONTHS;

  readonly appt = signal<FlowAppointmentRecord | null>(null);
  readonly step = signal(0);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly treatments = signal<TreatmentOption[]>([]);
  readonly categories = signal<CategoryOption[]>([]);
  private changed = false;
  private readonly body = viewChild<ElementRef<HTMLElement>>('wzBody');

  /** The error banner sits above the step content - scroll up to it whenever a new error is shown. */
  private readonly scrollToError = effect(() => {
    if (this.error()) this.body()?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Step 1
  profile = { name: '', email: '', age: null as number | null, gender: '', heard_from: '' };
  photoFile: File | null = null;
  photoPreview: string | null = null;
  newDocs: { file: File; title: string }[] = [];

  // Step 2
  /** Service category name saved on the appointment (Hair, Skin, Combo, Slimming ...). */
  category = '';
  /** The service category picked in the dropdown. */
  categoryId: number | null = null;
  vitals = { bp: '', weight: null as number | null, is_allergy: false };
  c: Consultation = emptyConsultation();

  // Step 3: one row per treatment, each with its own number of sittings and gap between them.
  plan: { lines: PlanLine[]; doctor_suggestion: string } = { lines: [blankLine()], doctor_suggestion: '' };

  // Step 4
  pay = { payment_mode: 'UPI' as PaymentMode, paid_amount: 0, transaction_no: '', emi_months: 6 };

  // Step 4: discount (asked here, decided by the branch manager)
  /** The "Discount" switch of the Payment step. */
  discountOn = false;
  disc: { type: DiscountType; value: number | null; reason: string } = { type: 'percent', value: null, reason: '' };
  readonly discountBusy = signal(false);
  readonly discountError = signal<string | null>(null);

  /** Once the terms are accepted the consultation is locked (the invoice is issued). */
  readonly locked = computed(() => !!this.appt()?.terms_accepted_at || this.appt()?.status === 'Converted');

  ngOnInit(): void {
    // Categories with their treatments (real ids + price + default sittings).
    this.api.GetAllPages(ApiRoutesConstants.SERVICE_CATEGORY_TREE_LIST).subscribe({
      next: (categories: any[]) => {
        const active = categories.filter(cat => cat.is_active !== false);
        this.categories.set(active
          .map(cat => ({ id: Number(cat.id), name: cat.name ?? '', kind: categoryKind(cat.name), icon: categoryIcon(cat.name) })));
        this.treatments.set(active.flatMap(cat => (cat.treatments ?? [])
          .filter((t: any) => t.is_active !== false)
          .map((t: any) => ({
            id: Number(t.id), name: t.name, total_amount: Number(t.total_amount ?? 0), default_sittings: Number(t.default_sittings ?? 1),
            category: cat.name ?? '', category_id: Number(cat.id),
          }))));
        this.syncCategoryId();
      },
      error: () => {
        this.categories.set([]);
        this.treatments.set([]);
      },
    });
    this.reload(true);
  }

  private reload(jumpToCurrent = false): void {
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}`).subscribe({
      next: (res: any) => {
        this.apply(res.data);
        if (jumpToCurrent) {
          const target = Math.min(4, Math.max(0, (res.data.current_step ?? 1) - 1));
          // Land on the current step, or the nearest one this role may open.
          this.step.set(this.steps()[target].allowed ? target : this.steps().some((s, i) => i < target && s.allowed) ? this.allowedStep(target, -1) : this.allowedStep(target, 1));
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.toast.error(err?.error?.message || 'Could not open the appointment.');
        this.dialogRef.close(false);
      },
    });
  }

  private apply(a: FlowAppointmentRecord): void {
    this.appt.set(a);
    this.profile = { name: a.name, email: a.email ?? '', age: a.age, gender: a.gender ?? '', heard_from: a.heard_from ?? a.lead?.source?.source_name ?? '' };
    this.photoPreview = a.photo_url ?? null;
    this.category = a.category ?? '';
    this.vitals = { bp: a.bp ?? '', weight: a.weight !== null ? Number(a.weight) : null, is_allergy: !!a.is_allergy };
    this.c = { ...emptyConsultation(), ...(a.consultation ?? {}) };
    this.c.hairPull = { frontal: null, occipital: null, lesional: null, ...(a.consultation?.['hairPull'] ?? {}) };
    // Saved treatments; an older appointment only has its single treatment on the appointment itself.
    const saved = a.treatment_lines?.length
      ? a.treatment_lines
      : a.treatment_id ? [{ treatment_id: a.treatment_id, sittings_count: a.sittings_count, sitting_interval_days: a.sitting_interval_days }] : [];
    this.plan = {
      lines: saved.length
        ? saved.map(l => ({ treatment_id: Number(l.treatment_id), sittings_count: Number(l.sittings_count) || 1, sitting_interval_days: Number(l.sitting_interval_days) || 30 }))
        : [blankLine()],
      doctor_suggestion: a.doctor_suggestion ?? '',
    };
    this.syncCategoryId();
    this.pay = {
      payment_mode: a.payment_mode ?? 'UPI',
      paid_amount: Number(a.paid_amount) || 0,
      transaction_no: a.transaction_no ?? '',
      emi_months: a.emi_months ?? 6,
    };
  }

  // ---------------------------------------------------------------- navigation

  goTo(index: number): void {
    const target = this.steps()[index];
    if (target && !target.allowed) {
      this.toast.warning('Access denied', `Your role does not have permission to open "${target.label}". Ask your administrator to enable it for your role in Roles & Permissions.`);
      return;
    }
    const reached = Math.max(0, (this.appt()?.current_step ?? 1) - 1);
    if (index <= reached && this.steps()[index]?.allowed) {
      this.error.set(null); // a message from another step does not belong here
      this.step.set(index);
    }
  }

  back(): void {
    this.error.set(null);
    this.step.update(s => this.allowedStep(s, -1));
  }

  next(): void {
    this.error.set(null);
    if (this.locked()) {
      this.step.update(s => this.allowedStep(s, 1));
      return;
    }
    const savers = [() => this.saveProfile(), () => this.saveClinical(), () => this.saveTreatment(), () => this.savePayment()];
    savers[this.step()]?.();
  }

  close(): void {
    this.dialogRef.close(this.changed);
  }

  // ---------------------------------------------------------------- step 1

  onPhoto(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return void this.error.set('Choose an image file for the profile photo.');
    if (file.size > 2 * 1024 * 1024) return void this.error.set('The profile photo must be 2 MB or smaller.');
    this.photoFile = file;
    const reader = new FileReader();
    reader.onload = () => (this.photoPreview = String(reader.result));
    reader.readAsDataURL(file);
  }

  onDocs(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) { this.error.set(`${file.name}: upload a PDF, JPG or PNG.`); continue; }
      if (file.size > 5 * 1024 * 1024) { this.error.set(`${file.name} is larger than 5 MB.`); continue; }
      this.newDocs.push({ file, title: file.name.replace(/\.[^.]+$/, '') });
    }
  }

  removeNewDoc(index: number): void {
    this.newDocs.splice(index, 1);
  }

  /** Patient documents are private: load through the API (with the login token) as a blob and open it in a new tab. */
  viewDocument(doc: FlowDocument, event: Event): void {
    event.preventDefault();
    const tab = window.open('', '_blank'); // opened before the request so the popup blocker allows it
    this.api.GET_BLOB(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/documents/${doc.id}`).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(doc.mime ? new Blob([blob], { type: doc.mime }) : blob);
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        tab?.close();
        this.toast.error('Could not open the document.');
      },
    });
  }

  deleteSavedDoc(id: number): void {
    this.api.Delete(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/documents/${id}`, {}).subscribe({
      next: (res: any) => { this.changed = true; this.appt.set(res.data); },
      error: (err: any) => this.toast.error(err?.error?.message || 'Could not remove the document.'),
    });
  }

  private saveProfile(): void {
    if (!this.profile.name.trim()) return void this.error.set('Name is required.');
    const body = new FormData();
    body.append('name', this.profile.name.trim());
    body.append('email', this.profile.email ?? '');
    if (this.profile.age) body.append('age', String(this.profile.age));
    if (this.profile.gender) body.append('gender', this.profile.gender);
    body.append('heard_from', this.profile.heard_from ?? '');
    if (this.photoFile) body.append('photo', this.photoFile);
    this.newDocs.forEach((d, i) => {
      body.append(`documents[${i}]`, d.file);
      body.append(`document_titles[${i}]`, d.title);
    });

    this.send(this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/profile`, body), () => {
      this.photoFile = null;
      this.newDocs = [];
    });
  }

  // ---------------------------------------------------------------- step 2

  get gradeOptions(): string[] {
    return this.profile.gender === 'Female' ? LUDWIG_GRADES : NORWOOD_GRADES;
  }

  toggle(list: string[], value: string): void {
    const i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1);
    else list.push(value);
  }

  private saveClinical(): void {
    if (!this.profile.gender) return void this.error.set('Select the gender (it decides the grading scale).');
    if (!this.category) return void this.error.set('Choose the service category.');
    if (this.showHairExam && !this.c.grade) return void this.error.set(`Select the ${this.profile.gender === 'Female' ? 'Ludwig grade' : 'Norwood grade'}.`);
    if (this.showSkinExam && !this.c.skinType) return void this.error.set('Select the skin type.');
    const pull = this.c.hairPull;
    if ([pull.frontal, pull.occipital, pull.lesional].some(v => v !== null && v !== undefined && (Number(v) < 0 || Number(v) > 50))) {
      return void this.error.set('Hair pull counts are out of 50.');
    }
    const categoryId = this.categoryId;
    const lines = this.plan.lines.map(l => ({ ...l }));

    this.send(this.api.PUT(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/clinical`, {
      gender: this.profile.gender,
      category: this.category,
      consultation: this.c,
      bp: this.vitals.bp || null,
      weight: this.vitals.weight,
      is_allergy: this.vitals.is_allergy || this.c.allergies.length > 0,
    }), () => this.keepServiceRequest(categoryId, lines));
  }

  /** The service request picked here is saved with step 3, so keep it when the clinical save reloads the appointment. */
  private keepServiceRequest(categoryId: number | null, lines: PlanLine[]): void {
    if (!lines[0]?.treatment_id || lines[0].treatment_id === this.plan.lines[0]?.treatment_id) return;
    this.plan = { ...this.plan, lines };
    this.categoryId = categoryId;
  }

  /** The service category shown in the dropdown. */
  get selectedCategory(): CategoryOption | undefined {
    return this.categories().find(c => c.id === this.categoryId);
  }

  /** Service category dropdown changed. */
  onCategoryChange(id: number | null): void {
    const cat = this.categories().find(c => c.id === Number(id));
    if (cat) return this.selectCategory(cat);
    this.categoryId = null;
    this.category = '';
    this.c.grade = '';
    this.plan.lines.forEach(l => (l.treatment_id = null));
  }

  /** Hair / Skin / Combo / Other of the picked category (older appointments only saved "Hair" / "Skin"). */
  get examKind(): ExamKind | '' {
    return this.selectedCategory?.kind ?? (this.category ? categoryKind(this.category) : '');
  }

  get showHairExam(): boolean {
    return this.examKind === 'Hair' || this.examKind === 'Combo';
  }

  get showSkinExam(): boolean {
    return this.examKind === 'Skin' || this.examKind === 'Combo';
  }

  /** Service category picked: switch the examination sections and drop a service request from another category. */
  selectCategory(cat: CategoryOption): void {
    if (this.categoryId === cat.id) return;
    if (!this.showHairExam || !(cat.kind === 'Hair' || cat.kind === 'Combo')) this.c.grade = '';
    this.category = cat.name;
    this.categoryId = cat.id;
    // A treatment of another category no longer applies.
    this.plan.lines.forEach(l => {
      const t = this.treatmentOf(l);
      if (t && t.category_id !== cat.id) l.treatment_id = null;
    });
  }

  /** Picks the service category from the saved service request, else the saved / lead's category name, else Hair / Skin. */
  private syncCategoryId(): void {
    const cats = this.categories();
    const a = this.appt();
    if (!cats.length || !a) return;
    const saved = this.category.toLowerCase();
    const leadCategory = (a.lead?.service_category?.name ?? '').toLowerCase();
    const match = cats.find(c => c.id === this.selectedTreatment?.category_id)
      ?? cats.find(c => saved && c.name.toLowerCase() === saved)
      ?? cats.find(c => !saved && c.name.toLowerCase() === leadCategory)
      ?? cats.find(c => !!saved && c.kind === categoryKind(saved));
    this.categoryId = match?.id ?? null;
    if (match) this.category = match.name;
  }

  // ---------------------------------------------------------------- step 3

  /** Service requests (treatments) of the picked service category. */
  get filteredTreatments(): TreatmentOption[] {
    if (this.categoryId) return this.treatments().filter(t => t.category_id === this.categoryId);
    const cat = this.category.toLowerCase();
    const matching = this.treatments().filter(t => t.category.toLowerCase().includes(cat));
    return cat && matching.length ? matching : this.treatments();
  }

  /** The treatment picked on a row. */
  treatmentOf(line: PlanLine | undefined): TreatmentOption | undefined {
    return line ? this.treatments().find(t => t.id === Number(line.treatment_id)) : undefined;
  }

  /** The first treatment - the "Service Request" picked on the Clinical Examination step. */
  get selectedTreatment(): TreatmentOption | undefined {
    return this.treatmentOf(this.plan.lines[0]);
  }

  /** Service Request (step 2) is the first treatment row. */
  get serviceRequestId(): number | null {
    return this.plan.lines[0]?.treatment_id ?? null;
  }

  set serviceRequestId(id: number | null) {
    if (!this.plan.lines.length) this.plan.lines.push(blankLine());
    this.plan.lines[0].treatment_id = id;
  }

  /** Treatments a row can pick: the category's, minus the ones other rows already have (each treatment only once). */
  optionsFor(index: number): TreatmentOption[] {
    const taken = new Set(this.plan.lines.filter((_, i) => i !== index).map(l => Number(l.treatment_id)));
    const own = this.treatmentOf(this.plan.lines[index]);
    const base = this.filteredTreatments;
    return (own && !base.includes(own) ? [own, ...base] : base).filter(t => !taken.has(t.id));
  }

  get canAddLine(): boolean {
    return this.plan.lines.length < MAX_TREATMENTS && this.filteredTreatments.some(t => !this.plan.lines.some(l => Number(l.treatment_id) === t.id));
  }

  addLine(): void {
    if (this.canAddLine) this.plan.lines.push(blankLine());
  }

  removeLine(index: number): void {
    if (this.plan.lines.length > 1) this.plan.lines.splice(index, 1);
  }

  /** A row's treatment changed: start from that treatment's usual number of sittings. */
  onLineTreatmentChange(index: number): void {
    const t = this.treatmentOf(this.plan.lines[index]);
    if (t) this.plan.lines[index].sittings_count = t.default_sittings || 1;
  }

  private saveTreatment(): void {
    const lines = this.plan.lines;
    if (lines.some(l => !l.treatment_id)) return void this.error.set(lines.length > 1 ? 'Choose the treatment for every row.' : 'Choose the treatment.');
    if (lines.some(l => !(Number(l.sittings_count) >= 1))) return void this.error.set('Sittings must be at least 1 for every treatment.');
    if (new Set(lines.map(l => Number(l.treatment_id))).size !== lines.length) return void this.error.set('A treatment can only be added once - change its sittings instead.');

    this.send(this.api.PUT(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/treatment`, {
      treatments: lines.map(l => ({
        treatment_id: Number(l.treatment_id),
        sittings_count: Number(l.sittings_count),
        sitting_interval_days: Number(l.sitting_interval_days) || 30,
      })),
      doctor_suggestion: this.plan.doctor_suggestion || null,
    }), () => {
      // The Payment step opens with the API's total (every treatment x its sittings).
      if (!this.pay.paid_amount) this.pay.paid_amount = this.total;
    });
  }

  // ---------------------------------------------------------------- step 4

  get total(): number {
    return Number(this.appt()?.total_amount ?? 0);
  }

  /** Price details of the Payment step: one row per treatment (price per sitting x sittings), as saved by the API. */
  get priceLines(): { name: string; price: number; sittings: number; gap: number; amount: number }[] {
    const a = this.appt();
    if (!a) return [];
    if (a.treatment_lines?.length) {
      return a.treatment_lines.map(l => ({
        name: l.treatment?.name ?? 'Treatment', price: Number(l.price_per_sitting), sittings: Number(l.sittings_count),
        gap: Number(l.sitting_interval_days), amount: Number(l.total_amount),
      }));
    }
    return a.treatment_id
      ? [{ name: a.treatment?.name ?? 'Treatment', price: Number(a.price_per_sitting), sittings: Number(a.sittings_count), gap: Number(a.sitting_interval_days), amount: Number(a.total_amount) }]
      : [];
  }

  get balance(): number {
    return Math.max(0, this.total - (Number(this.pay.paid_amount) || 0));
  }

  get emiInstalment(): number {
    return this.pay.emi_months ? Math.round((this.balance / this.pay.emi_months) * 100) / 100 : 0;
  }

  get needsReference(): boolean {
    return this.pay.payment_mode === 'UPI' || this.pay.payment_mode === 'Online';
  }

  private savePayment(): void {
    const paid = Number(this.pay.paid_amount);
    if (!(paid >= 0) || paid > this.total) return void this.error.set(`Amount must be between 0 and ${inr(this.total)}.`);
    if (this.needsReference && !this.pay.transaction_no.trim()) return void this.error.set('Enter the UPI / online transaction reference.');

    this.send(this.api.PUT(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/payment`, {
      payment_mode: this.pay.payment_mode,
      paid_amount: paid,
      transaction_no: this.pay.transaction_no.trim() || null,
      emi_months: this.pay.payment_mode === 'EMI' ? this.pay.emi_months : null,
    }), undefined, res => (res?.data?.sms_sent ? this.toast.success(res.message) : this.toast.warning(res?.message)));
  }

  // ---------------------------------------------------------------- step 4: discount

  /** Roles & Permissions -> Appointment module action that lets a role ask for a discount (the API checks the same). */
  private static readonly REQUEST_DISCOUNT_ACTION = 'request-discount';
  /** Used for the live preview only; the API enforces the real limit (and says so). */
  private static readonly DEFAULT_MAX_DISCOUNT = 50;

  get discountRequest() {
    const r = this.appt()?.discount_request ?? null;
    return r && r.status !== 'Cancelled' ? r : null;
  }

  /** The treatments' total before any discount. */
  get subtotal(): number {
    const s = Number(this.appt()?.subtotal_amount);
    return s > 0 ? s : this.total + this.discountApplied;
  }

  /** The discount a branch manager approved (rupees). */
  get discountApplied(): number {
    return Number(this.appt()?.discount_amount) || 0;
  }

  /** Staff may ask while the payment is not saved yet and their role is ticked on "Request Discount". */
  get canRequestDiscount(): boolean {
    const a = this.appt();
    return !!a && !this.locked() && !a.terms_sent_at && this.subtotal > 0 && this.auth.hasActionAccess(AppointmentWizard.REQUEST_DISCOUNT_ACTION);
  }

  /** The panel is shown to who may ask, and to anyone once a request exists (its outcome is part of the payment). */
  get showDiscountPanel(): boolean {
    return this.canRequestDiscount || !!this.discountRequest;
  }

  get discountToggleOn(): boolean {
    return this.discountOn || !!this.discountRequest;
  }

  /** A waiting or approved discount cannot be switched off from here (cancel the request instead). */
  get discountToggleLocked(): boolean {
    const status = this.discountRequest?.status;
    return status === 'Pending' || status === 'Approved';
  }

  /** The request form is shown until a request is waiting or approved. */
  get canAskDiscount(): boolean {
    return this.canRequestDiscount && this.discountToggleOn && !this.discountToggleLocked;
  }

  toggleDiscount(on: boolean): void {
    this.discountOn = on;
    this.discountError.set(null);
  }

  setDiscountType(type: DiscountType): void {
    if (this.disc.type === type) return;
    const amount = this.askAmount;
    this.disc.type = type;
    // Keep the same rupee value when switching, so only a little has to be adjusted.
    this.disc.value = type === 'amount' ? amount || null : this.subtotal > 0 ? Math.round(amount / this.subtotal * 10000) / 100 || null : null;
  }

  /** Rupee value of what is typed. */
  get askAmount(): number {
    const v = Number(this.disc.value) || 0;
    if (v <= 0) return 0;
    return this.disc.type === 'percent' ? Math.round(this.subtotal * v / 100 * 100) / 100 : Math.round(v * 100) / 100;
  }

  get askCap(): number {
    return Math.round(this.subtotal * (this.discountRequest?.max_discount_percent ?? AppointmentWizard.DEFAULT_MAX_DISCOUNT) / 100 * 100) / 100;
  }

  get askPayable(): number {
    return Math.max(0, this.subtotal - this.askAmount);
  }

  sendDiscountRequest(): void {
    this.discountError.set(null);
    if (!(this.askAmount > 0)) return void this.discountError.set('Enter the discount you are asking for.');
    if (this.askAmount > this.askCap + 0.001) return void this.discountError.set(`The discount can be at most ${inr(this.askCap)} (${AppointmentWizard.DEFAULT_MAX_DISCOUNT}% of the total).`);
    if (this.disc.reason.trim().length < 3) return void this.discountError.set('Write the reason - the branch manager reads it before deciding.');

    this.discountBusy.set(true);
    this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/discount-request`, {
      discount_type: this.disc.type,
      value: Number(this.disc.value),
      reason: this.disc.reason.trim(),
    }).pipe(finalize(() => this.discountBusy.set(false))).subscribe({
      next: (res: any) => {
        this.changed = true;
        this.appt.set(res.data); // not apply(): what is typed on the payment (amount, mode) stays
        this.disc = { type: 'percent', value: null, reason: '' };
        this.toast.success(res?.message || 'Discount request sent.');
      },
      error: (err: any) => this.discountError.set(this.messageOf(err)),
    });
  }

  cancelDiscountRequest(): void {
    const r = this.discountRequest;
    if (!r || r.status !== 'Pending') return;
    this.discountBusy.set(true);
    this.api.Delete(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/discount-request/${r.id}`, {})
      .pipe(finalize(() => this.discountBusy.set(false)))
      .subscribe({
        next: (res: any) => {
          this.appt.set(res.data);
          this.discountOn = false;
          this.toast.success(res?.message || 'Discount request cancelled.');
        },
        error: (err: any) => this.discountError.set(this.messageOf(err)),
      });
  }

  /**
   * While a request is waiting, the Payment step looks for the branch manager's decision every few seconds (and as soon
   * as the tab is looked at again) and shows it at once: an approval lowers the payable total, a rejection shows the note.
   */
  private readonly discountWatcher = (() => {
    const destroyRef = inject(DestroyRef);
    const check = () => {
      const a = this.appt();
      if (!a || this.step() !== 3 || a.discount_request?.status !== 'Pending' || this.saving() || document.visibilityState === 'hidden') return;
      this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}`).subscribe({
        next: (res: any) => this.onDiscountUpdate(res?.data),
        error: () => undefined, // the next tick simply tries again
      });
    };
    const timer = setInterval(check, 4000);
    document.addEventListener('visibilitychange', check);
    destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    });
  })();

  private onDiscountUpdate(a: FlowAppointmentRecord | undefined): void {
    const before = this.appt()?.discount_request;
    if (!a || before?.status !== 'Pending') return;
    const after = a.discount_request;
    if (after?.status === 'Pending') return;

    const previousTotal = this.total;
    this.appt.set(a); // keep what is typed on the payment
    this.changed = true;

    if (after?.status === 'Approved') {
      // The payable total dropped: the amount paying now follows it unless the user set a smaller one.
      if (!this.pay.paid_amount || this.pay.paid_amount >= previousTotal || this.pay.paid_amount > this.total) this.pay.paid_amount = this.total;
      const asked = after.approved_type === 'percent' ? `${after.approved_value}% (${inr(after.approved_amount)})` : inr(after.approved_amount);
      this.toast.success('Discount approved', `${asked} off - the customer now pays ${inr(this.total)}.`);
    } else if (after?.status === 'Rejected') {
      this.toast.warning('Discount rejected', after.decision_note ?? undefined);
    }
  }

  private messageOf(err: any): string {
    const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
    return first || err?.error?.message || 'Could not send. Please try again.';
  }

  // ---------------------------------------------------------------- step 5

  resendTerms(): void {
    this.act('terms/resend', res => (res?.data?.sms_sent ? this.toast.success(res.message) : this.toast.warning(res?.message)));
  }

  acceptInPerson(): void {
    this.act('terms/accept', res => this.toast.success(res?.message || 'Terms accepted.'));
  }

  refreshStatus(): void {
    this.reload();
  }

  /**
   * While the Terms & Invoice step waits for the customer, look for their acceptance (the SMS link opens on their own
   * phone, so nothing here would otherwise change): every few seconds, and as soon as this tab is looked at again.
   * Failures are ignored - the next tick simply tries again.
   */
  private readonly termsWatcher = (() => {
    const destroyRef = inject(DestroyRef);
    const check = () => {
      const a = this.appt();
      if (!a || a.terms_accepted_at || this.step() !== 4 || this.saving() || document.visibilityState === 'hidden') return;
      this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}`).subscribe({
        next: (res: any) => {
          if (!res?.data?.terms_accepted_at) return;
          this.changed = true;
          this.apply(res.data);
          this.toast.success('The customer accepted the terms.');
        },
        error: () => undefined,
      });
    };
    const timer = setInterval(check, 5000);
    document.addEventListener('visibilitychange', check);
    destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    });
  })();

  convert(): void {
    this.act('convert', res => {
      this.toast.success(res?.message || 'Customer created.');
      this.dialogRef.close(true);
    });
  }

  /** Loads the server-rendered tax invoice as a blob and opens it in a new tab (same as the purchase PDFs). */
  viewInvoice(): void {
    const a = this.appt();
    if (!a?.invoice_no) return;
    const tab = window.open('', '_blank'); // opened before the request so the popup blocker allows it
    this.api.GET_BLOB(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${a.id}/invoice`).subscribe({
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

  downloadInvoice(): void {
    const a = this.appt();
    if (!a?.invoice_no) return;
    this.api.GET_BLOB(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${a.id}/invoice?download=1`).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${a.invoice_no}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Could not download the invoice.'),
    });
  }

  private act(path: string, done: (res: any) => void): void {
    this.saving.set(true);
    this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/${path}`, {})
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res: any) => { this.changed = true; this.apply(res.data); done(res); },
        error: (err: any) => this.showError(err),
      });
  }

  // ---------------------------------------------------------------- shared

  /** Saves a step; on success refreshes the record and moves to the next step. */
  private send(request: any, after?: () => void, notify?: (res: any) => void): void {
    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (res: any) => {
        this.changed = true;
        this.apply(res.data);
        after?.();
        notify ? notify(res) : this.toast.success(res?.message || 'Saved.');
        this.step.update(s => this.allowedStep(s, 1));
      },
      error: (err: any) => this.showError(err),
    });
  }

  private showError(err: any): void {
    const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
    this.error.set(first || err?.error?.message || 'Could not save. Please try again.');
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso.length > 10 ? iso : `${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
}

/** Which examination sections a service category needs: Combo (or hair + skin) shows both, others (e.g. Slimming) neither. */
function categoryKind(name: string | null | undefined): ExamKind {
  const value = (name ?? '').toLowerCase();
  const hair = value.includes('hair');
  const skin = value.includes('skin');
  if (value.includes('combo') || (hair && skin)) return 'Combo';
  return hair ? 'Hair' : skin ? 'Skin' : 'Other';
}

function categoryIcon(name: string | null | undefined): string {
  const value = (name ?? '').toLowerCase();
  if (value.includes('slim') || value.includes('weight')) return 'bi-heart-pulse';
  return ({ Hair: 'bi-scissors', Skin: 'bi-droplet-half', Combo: 'bi-stars', Other: 'bi-tags' } as Record<ExamKind, string>)[categoryKind(name)];
}
