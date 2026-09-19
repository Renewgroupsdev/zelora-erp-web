import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BaldnessType, ComboOffer, PAYMENT_METHODS, PaymentStatus, TREATMENT_CATEGORIES, Treatment, TreatmentCategory, TreatmentPackage, baldnessTypesFor, formatCurrency, packagesByCategory } from '../../data/treatment-catalog';
import { NotificationService } from '../../common-services/notification.service';
import { DatePickerDirective } from '../../directives/date-picker.directive';
import { TimePickerDirective } from '../../directives/time-picker.directive';

export type BookingType = 'single' | 'combo' | 'package';

export interface BookingFormData {
  branches: string[];
  staffOptions: string[];
  treatments: Treatment[];
  combos?: ComboOffer[];
  /** Pre-fills the form (e.g. customer name/phone/branch from a lead) without treating it as editing an existing record. */
  initial?: Partial<BookingFormResult>;
  /** True only when `initial` represents an existing booking being edited/rescheduled - controls the "Edit"/"Reschedule" title, not just whether fields are pre-filled. */
  editMode?: boolean;
}

export interface BookingFormResult {
  customerName: string;
  phone: string;
  gender: string;
  branch: string;
  staff: string;
  /** Human-readable summary: selected treatment names joined, the combo name, or the package name. */
  service: string;
  date: string;
  startTime: string;
  duration: number;
  notes: string;
  treatmentKeys: string[];
  comboKey: string | null;
  packageKey: string | null;
  /** Set only when the Hair category is booked - the Norwood/Ludwig classification picked for this customer. */
  baldnessType: string | null;
  /** Doctor's suggestions for this booking, kept separate from the general notes field. */
  doctorNotes: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  paymentMethod: string;
  amountPaid: number;
  paymentStatus: PaymentStatus;
}

@Component({
  selector: 'app-booking-form-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, DatePickerDirective, TimePickerDirective],
  templateUrl: './booking-form-dialog.html',
  styleUrl: './booking-form-dialog.scss',
})
export class BookingFormDialog {
  form: FormGroup;
  isSaving = false;

  readonly durationOptions = [15, 30, 45, 60, 90, 120];
  readonly paymentMethods = PAYMENT_METHODS;
  readonly categories = TREATMENT_CATEGORIES;

  selectedTreatmentKeys = new Set<string>();
  selectedComboKey: string | null = null;
  selectedPackageKey: string | null = null;
  bookingType: BookingType = 'single';
  activeCategory: TreatmentCategory = TREATMENT_CATEGORIES[0];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<BookingFormDialog, BookingFormResult>,
    private notifications: NotificationService,
    @Inject(MAT_DIALOG_DATA) public data: BookingFormData,
  ) {
    const initial = data.initial;

    this.form = this.fb.group({
      customerName: [initial?.customerName ?? '', [Validators.required, Validators.maxLength(100)]],
      phone: [initial?.phone ?? '', [Validators.required, Validators.pattern(/^[0-9+\-\s()]{8,20}$/)]],
      gender: [initial?.gender ?? ''],
      branch: [initial?.branch ?? '', Validators.required],
      staff: [initial?.staff ?? '', Validators.required],
      service: [initial?.service ?? '', Validators.required],
      date: [initial?.date ?? '', Validators.required],
      startTime: [initial?.startTime ?? '', Validators.required],
      duration: [initial?.duration ?? 30, Validators.required],
      notes: [initial?.notes ?? ''],
      doctorNotes: [initial?.doctorNotes ?? ''],
      baldnessType: [initial?.baldnessType ?? ''],
      discountPercent: [0, [Validators.min(0), Validators.max(50)]],
      paymentMethod: [initial?.paymentMethod ?? PAYMENT_METHODS[0]],
      amountPaid: [initial?.amountPaid ?? 0, [Validators.min(0)]],
    });

    (initial?.treatmentKeys ?? []).forEach((key) => this.selectedTreatmentKeys.add(key));
    this.selectedComboKey = initial?.comboKey ?? null;
    this.selectedPackageKey = initial?.packageKey ?? null;

    if (this.selectedComboKey) {
      this.bookingType = 'combo';
    } else if (this.selectedPackageKey) {
      this.bookingType = 'package';
    } else {
      const firstKey = [...this.selectedTreatmentKeys][0];
      const firstTreatment = firstKey ? data.treatments.find((t) => t.key === firstKey) : undefined;
      this.activeCategory = firstTreatment?.category ?? TREATMENT_CATEGORIES[0];
    }

    this.form.get('discountPercent')?.valueChanges.subscribe(() => this.syncAmountPaid());
    this.form.get('gender')?.valueChanges.subscribe(() => this.form.get('baldnessType')?.setValue(''));
  }

  get isEdit(): boolean {
    return !!this.data.editMode;
  }

  get title(): string {
    if (this.isEdit) return 'Edit Appointment';
    return 'New Appointment';
  }

  get subtitle(): string {
    if (this.isEdit) return 'Update this appointment\'s details';
    return 'Book a confirmed customer appointment';
  }

  get saveLabel(): string {
    if (this.isSaving) return 'Saving...';
    if (this.isEdit) return 'Save Changes';
    return 'Book Appointment';
  }

  get showBaldnessTypes(): boolean {
    return this.bookingType === 'single' && this.activeCategory === 'Hair' && this.baldnessTypeOptions.length > 0;
  }

  get baldnessTypeOptions(): BaldnessType[] {
    return baldnessTypesFor(this.form.get('gender')?.value);
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  close(): void {
    this.dialogRef.close();
  }

  // ---------------------------------------------------------------------
  // Treatments & combos
  // ---------------------------------------------------------------------

  get availableTreatments(): Treatment[] {
    return this.data.treatments;
  }

  get availableCombos(): ComboOffer[] {
    return this.data.combos ?? [];
  }

  get availablePackages(): TreatmentPackage[] {
    return packagesByCategory(this.activeCategory);
  }

  treatmentName(key: string): string {
    return this.availableTreatments.find((t) => t.key === key)?.name ?? key;
  }

  isTreatmentSelected(key: string): boolean {
    return this.selectedTreatmentKeys.has(key);
  }

  toggleTreatment(key: string): void {
    if (this.selectedComboKey) return;

    if (this.selectedTreatmentKeys.has(key)) {
      this.selectedTreatmentKeys.delete(key);
    } else {
      this.selectedTreatmentKeys.add(key);
    }

    this.syncServiceControl();
    this.syncAmountPaid();
  }

  selectCombo(comboKey: string): void {
    if (this.selectedComboKey === comboKey) {
      this.selectedComboKey = null;
      this.selectedTreatmentKeys.clear();
    } else {
      const combo = this.availableCombos.find((c) => c.key === comboKey);
      this.selectedComboKey = comboKey;
      this.selectedTreatmentKeys = new Set(combo?.treatmentKeys ?? []);
    }

    this.syncServiceControl();
    this.syncAmountPaid();
  }

  isPackageSelected(key: string): boolean {
    return this.selectedPackageKey === key;
  }

  selectPackage(packageKey: string): void {
    this.selectedPackageKey = this.selectedPackageKey === packageKey ? null : packageKey;
    this.syncServiceControl();
    this.syncAmountPaid();
  }

  setBookingType(type: BookingType): void {
    if (this.bookingType === type) return;

    this.bookingType = type;
    this.selectedTreatmentKeys.clear();
    this.selectedComboKey = null;
    this.selectedPackageKey = null;

    this.syncServiceControl();
    this.syncAmountPaid();
  }

  setCategory(category: TreatmentCategory): void {
    this.activeCategory = category;
    this.selectedPackageKey = null;
    this.syncServiceControl();
    this.syncAmountPaid();
  }

  selectBaldnessType(key: string): void {
    this.form.get('baldnessType')?.setValue(key);
  }

  treatmentsInCategory(category: TreatmentCategory | null): Treatment[] {
    if (!category) return [];
    const gender = this.form.get('gender')?.value;
    return this.availableTreatments.filter((t) => t.category === category && (!t.gender || t.gender === 'All' || !gender || t.gender === gender));
  }

  private rawSumFor(keys: string[]): number {
    return keys.reduce((sum, key) => sum + (this.availableTreatments.find((t) => t.key === key)?.price ?? 0), 0);
  }

  /** Combo/package price if one is active, otherwise the raw sum of individually picked treatments. */
  get priceAfterCombo(): number {
    if (this.selectedComboKey) {
      return this.availableCombos.find((c) => c.key === this.selectedComboKey)?.price ?? 0;
    }
    if (this.selectedPackageKey) {
      return this.availablePackages.find((p) => p.key === this.selectedPackageKey)?.price ?? 0;
    }
    return this.rawSumFor([...this.selectedTreatmentKeys]);
  }

  get comboSavings(): number {
    if (!this.selectedComboKey) return 0;
    const combo = this.availableCombos.find((c) => c.key === this.selectedComboKey);
    if (!combo) return 0;
    return Math.max(0, this.rawSumFor(combo.treatmentKeys) - combo.price);
  }

  get extraDiscountAmount(): number {
    const pct = Number(this.form.get('discountPercent')?.value) || 0;
    return Math.round((this.priceAfterCombo * pct) / 100);
  }

  get total(): number {
    return Math.max(0, this.priceAfterCombo - this.extraDiscountAmount);
  }

  get paymentStatus(): PaymentStatus {
    const paid = Number(this.form.get('amountPaid')?.value) || 0;
    if (this.total <= 0) return 'Pending';
    if (paid >= this.total) return 'Paid';
    if (paid > 0) return 'Partial';
    return 'Pending';
  }

  get paymentStatusClass(): string {
    const map: Record<PaymentStatus, string> = { Paid: 'status-green', Partial: 'status-orange', Pending: 'status-gray' };
    return map[this.paymentStatus];
  }

  paymentIcon(method: string): string {
    const map: Record<string, string> = { Cash: 'bi-cash-stack', Card: 'bi-credit-card-2-front', UPI: 'bi-phone', 'Net Banking': 'bi-bank' };
    return map[method] ?? 'bi-cash-stack';
  }

  formatCurrency(value: number): string {
    return formatCurrency(value);
  }

  markPaidInFull(): void {
    const control = this.form.get('amountPaid');
    control?.setValue(this.total);
    control?.markAsDirty();
  }

  private syncServiceControl(): void {
    let label: string;
    if (this.selectedComboKey) {
      label = this.availableCombos.find((c) => c.key === this.selectedComboKey)?.name ?? '';
    } else if (this.selectedPackageKey) {
      label = this.availablePackages.find((p) => p.key === this.selectedPackageKey)?.name ?? '';
    } else {
      label = [...this.selectedTreatmentKeys].map((key) => this.treatmentName(key)).join(' + ');
    }

    const control = this.form.get('service');
    control?.setValue(label);
    control?.markAsTouched();
  }

  /** Keeps "amount paying now" suggested at the full total as treatments/discount change,
   *  but only until the staff member edits it themselves (e.g. for a partial payment). */
  private syncAmountPaid(): void {
    const control = this.form.get('amountPaid');
    if (control && !control.dirty) {
      control.setValue(this.total);
    }
  }

  // ---------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;

    // No booking API exists yet - simulate the round trip so the dialog's saving
    // state/spinner behave the same way they will once a real POST is wired in.
    setTimeout(() => {
      this.isSaving = false;

      const raw = this.form.getRawValue();
      const result: BookingFormResult = {
        customerName: raw.customerName,
        phone: raw.phone,
        gender: raw.gender,
        branch: raw.branch,
        staff: raw.staff,
        service: raw.service,
        date: raw.date,
        startTime: raw.startTime,
        duration: raw.duration,
        notes: raw.notes,
        treatmentKeys: [...this.selectedTreatmentKeys],
        comboKey: this.selectedComboKey,
        packageKey: this.selectedPackageKey,
        baldnessType: this.showBaldnessTypes ? (raw.baldnessType || null) : null,
        doctorNotes: raw.doctorNotes,
        subtotal: this.priceAfterCombo,
        discountAmount: this.extraDiscountAmount,
        total: this.total,
        paymentMethod: raw.paymentMethod,
        amountPaid: Number(raw.amountPaid) || 0,
        paymentStatus: this.paymentStatus,
      };

      if (result.discountAmount > 0) {
        this.raiseDiscountNotifications(result);
      }

      this.dialogRef.close(result);
    }, 350);
  }

  /** A staff-applied discount is treated like an approval request: it notifies the
   *  desk and immediately confirms the branch manager has been informed, mirroring
   *  how a real discount-approval workflow would surface to the team. */
  private raiseDiscountNotifications(result: BookingFormResult): void {
    const discountPercent = this.form.get('discountPercent')?.value || 0;

    this.notifications.add({
      type: 'discount',
      title: 'Discount request',
      message: `${result.customerName} was given a ${discountPercent}% discount (-${formatCurrency(result.discountAmount)}) on ${result.service} at ${result.branch}.`,
      link: '/app/appointments',
    });

    this.notifications.add({
      type: 'manager',
      title: 'Branch manager notified',
      message: `${result.branch} branch manager has been notified about the discount on ${result.customerName}'s booking.`,
    });
  }
}
