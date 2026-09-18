import { CommonModule } from '@angular/common';
import { Component, HostListener, Inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FlowAppointment, FlowLead, FollowUpEntry } from '../../common-services/crm-flow.service';
import { CallerLogEntry } from '../../models/common-components.model';
import { CallLogHistoryDialog } from '../call-log-history-dialog/call-log-history-dialog';
import { DatePickerDirective } from '../../directives/date-picker.directive';
import { TimePickerDirective } from '../../directives/time-picker.directive';
import {
  BaldnessType,
  ComboOffer,
  PAYMENT_METHODS,
  PaymentStatus,
  TREATMENT_CATEGORIES,
  Treatment,
  TreatmentCategory,
  TreatmentPackage,
  baldnessTypesFor,
  formatCurrency,
  packagesByCategory,
} from '../../data/treatment-catalog';

export type LeadProfileStage = 'lead' | 'followup' | 'appointment';

/** Follow-up stage toggle: schedule the next visit, or just log a call/note against the lead. */
export type FollowUpMode = 'schedule' | 'notes';

/** Appointment stage treatment selection mode, mirroring the booking dialog. */
export type AppointmentBookingType = 'single' | 'combo' | 'package';

/** Which clinical photo gallery an upload/viewer action applies to. */
export type ClinicalPhotoTarget = 'before' | 'after';

interface ImageViewerState {
  target: ClinicalPhotoTarget;
  title: string;
  index: number;
}

export interface LeadProfileDialogData {
  lead: FlowLead;
  stage: LeadProfileStage;
  telecallers: string[];
  /** Follow-up stage only - the lead's logged call history, shown via the "Call History" icon. */
  callLogEntries?: CallerLogEntry[];
  /** Appointment stage only - the richer booking record (service/date/payment) to display and complete. */
  appointment?: FlowAppointment;
  /** Appointment stage only - the treatment/combo catalog to pick from when filling in missing details. */
  treatments?: Treatment[];
  combos?: ComboOffer[];
  /** Appointment stage only - true when there's no booking yet (e.g. opened directly from Lead Management's
   *  "Appointment" action): shows editable branch/staff/date/time fields and a "Book Appointment" footer
   *  instead of the read-only summary + "Confirm as Client" used to complete an existing booking. */
  isNewBooking?: boolean;
}

export interface LeadProfileDialogResult {
  action: 'followup' | 'appointment' | 'confirm-client' | 'book-appointment' | 'close';
  lead: FlowLead;
  /** Set when action === 'appointment' - the date/time chosen in "Schedule Appointment" mode. */
  scheduledDate?: string;
  scheduledTime?: string;
  /** Set when action === 'confirm-client' or 'book-appointment' - the completed/new appointment. */
  appointment?: FlowAppointment;
  /** Set when action === 'confirm-client' or 'book-appointment' - the amount paid entered for this booking. */
  amountPaid?: number;
}

@Component({
  selector: 'app-lead-profile-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, DatePickerDirective, TimePickerDirective],
  templateUrl: './lead-profile-dialog.html',
  styleUrl: './lead-profile-dialog.scss',
})
export class LeadProfileDialog {
  readonly form;
  readonly paymentMethods = PAYMENT_METHODS;
  readonly branches = ['Anna Nagar', 'Velachery', 'Indiranagar', 'Coimbatore', 'T Nagar', 'Bengaluru'];
  readonly categories = TREATMENT_CATEGORIES;

  history: FollowUpEntry[];
  followupMode: FollowUpMode = 'schedule';
  showTreatmentError = false;

  // Appointment stage - treatment/combo/package selection (mirrors BookingFormDialog).
  selectedTreatmentKeys = new Set<string>();
  selectedComboKey: string | null = null;
  selectedPackageKey: string | null = null;
  bookingType: AppointmentBookingType = 'single';
  activeCategory: TreatmentCategory = TREATMENT_CATEGORIES[0];

  // Appointment stage - clinical examination photos (before/after), captured or uploaded.
  beforeImages: string[] = [];
  afterImages: string[] = [];
  imageViewer: ImageViewerState | null = null;

  constructor(
    private fb: FormBuilder,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<LeadProfileDialog, LeadProfileDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: LeadProfileDialogData,
  ) {
    const lead = data.lead;
    const appointment = data.appointment;
    this.history = [...(lead.history ?? [])];

    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    const nowTime = today.toTimeString().slice(0, 5);

    this.form = this.fb.group({
      telecaller: [lead.telecaller || '', Validators.required],
      branch: [lead.branch || '', Validators.required],
      notes: [lead.notes || '', Validators.required],
      // followUpDate on seed/imported rows is a display string (e.g. "12-Sep-2026, 03:00 PM"), not an
      // ISO date the <input type="date"> could parse - always start this picker blank instead.
      scheduleDate: [''],
      scheduleTime: [''],
      entryDate: [isoToday],
      entryTime: [nowTime],
      nextFollowUpDate: [''],
      nextFollowUpTime: [''],
      doctorNotes: [appointment?.doctorNotes ?? ''],
      paymentMethod: [appointment?.paymentMethod || PAYMENT_METHODS[0]],
      amountPaid: [appointment?.paymentStatus === 'Paid' ? (appointment?.total ?? 0) : 0, [Validators.min(0)]],
      discountPercent: [0, [Validators.min(0), Validators.max(50)]],
      baldnessType: [appointment?.baldnessType ?? ''],
      // New-booking-only fields (Lead Management's "Appointment" action skips straight to booking).
      apptBranch: [appointment?.branch || lead.branch || ''],
      apptStaff: [appointment?.staff || lead.telecaller || ''],
      apptDate: [appointment?.date || ''],
      apptTime: [appointment?.startTime || ''],
    });

    this.beforeImages = [...(appointment?.beforeImages ?? [])];
    this.afterImages = [...(appointment?.afterImages ?? [])];

    (appointment?.treatmentKeys ?? []).forEach(key => this.selectedTreatmentKeys.add(key));
    this.selectedComboKey = appointment?.comboKey ?? null;
    this.selectedPackageKey = appointment?.packageKey ?? null;

    if (this.selectedComboKey) {
      this.bookingType = 'combo';
    } else if (this.selectedPackageKey) {
      this.bookingType = 'package';
    } else {
      const firstKey = [...this.selectedTreatmentKeys][0];
      const firstTreatment = firstKey ? (data.treatments ?? []).find(t => t.key === firstKey) : undefined;
      this.activeCategory = firstTreatment?.category ?? TREATMENT_CATEGORIES[0];
    }
  }

  get isLead(): boolean { return this.data.stage === 'lead'; }
  get isFollowUp(): boolean { return this.data.stage === 'followup'; }
  get isAppointment(): boolean { return this.data.stage === 'appointment'; }
  get isNewBooking(): boolean { return this.isAppointment && !!this.data.isNewBooking; }

  get stageLabel(): string {
    if (this.isLead) return 'New Lead';
    if (this.isFollowUp) return 'Follow-Up';
    if (this.isNewBooking) return 'Book Appointment';
    return 'Appointment';
  }

  initials(name: string): string {
    return name.split(/\s+/).map(value => value[0]).slice(0, 2).join('').toUpperCase();
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  formatDateDisplay(iso: string): string {
    if (!iso) return '';
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  formatTime(time: string): string {
    if (!time) return '';
    const [hh, mm] = time.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return time;
    const period = hh >= 12 ? 'PM' : 'AM';
    const displayHour = hh % 12 === 0 ? 12 : hh % 12;
    return `${displayHour}:${String(mm).padStart(2, '0')} ${period}`;
  }

  /** Flags obviously fake numbers (too short, all-same-digit, or a straight sequence) so a
   *  telecaller is nudged to verify before acting on this lead. */
  get phoneWarning(): string | null {
    if (!this.isLead) return null;
    const digits = this.data.lead.phone.replace(/\D/g, '');
    const local = digits.length > 10 ? digits.slice(-10) : digits;
    const isSuspicious = local.length < 10 || /^(\d)\1{9}$/.test(local) || '0123456789'.includes(local) || '9876543210'.includes(local);
    return isSuspicious ? 'This contact number looks suspicious (too short, repeated, or sequential digits). Double-check before proceeding.' : null;
  }

  setFollowupMode(mode: FollowUpMode): void {
    this.followupMode = mode;
  }

  get canViewCallHistory(): boolean {
    return !!(this.data.callLogEntries?.length || this.history.length);
  }

  openCallHistory(): void {
    this.dialog.open(CallLogHistoryDialog, {
      width: '440px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '86vh',
      autoFocus: false,
      restoreFocus: true,
      panelClass: 'call-log-history-dialog-panel',
      data: {
        leadName: this.data.lead.name,
        subtitle: this.data.lead.phone,
        entries: this.data.callLogEntries ?? [],
        followUps: this.history,
      },
    });
  }

  private composeEntryDate(): string {
    const entryDate = this.form.get('entryDate')?.value;
    const entryTime = this.form.get('entryTime')?.value;
    if (!entryDate) return new Date().toLocaleString();
    const display = this.formatDateDisplay(entryDate);
    return entryTime ? `${display}, ${this.formatTime(entryTime)}` : display;
  }

  private buildEntryFromForm(telecaller: string, notes: string): FollowUpEntry {
    const nextFollowUpDate = this.form.get('nextFollowUpDate')?.value || undefined;
    const nextFollowUpTime = this.form.get('nextFollowUpTime')?.value || undefined;
    return { date: this.composeEntryDate(), telecaller, notes, nextFollowUpDate, nextFollowUpTime };
  }

  addFollowUpEntry(): void {
    const telecaller = this.form.get('telecaller')?.value;
    const notes = this.form.get('notes')?.value;
    if (!telecaller || !notes) {
      this.form.markAllAsTouched();
      return;
    }

    this.history = [...this.history, this.buildEntryFromForm(telecaller, notes)];
    this.form.get('notes')?.reset('');
    this.form.get('nextFollowUpDate')?.reset('');
    this.form.get('nextFollowUpTime')?.reset('');
  }

  // ---------------------------------------------------------------------
  // Appointment stage - complete missing details & confirm as client
  // ---------------------------------------------------------------------

  get availableTreatments(): Treatment[] {
    return this.data.treatments ?? [];
  }

  get availableCombos(): ComboOffer[] {
    return this.data.combos ?? [];
  }

  get availablePackages(): TreatmentPackage[] {
    return packagesByCategory(this.activeCategory);
  }

  treatmentName(key: string): string {
    return this.availableTreatments.find(t => t.key === key)?.name ?? key;
  }

  isTreatmentSelected(key: string): boolean {
    return this.selectedTreatmentKeys.has(key);
  }

  toggleTreatment(key: string): void {
    if (this.selectedComboKey) return;
    if (this.selectedTreatmentKeys.has(key)) this.selectedTreatmentKeys.delete(key);
    else this.selectedTreatmentKeys.add(key);
  }

  selectCombo(comboKey: string): void {
    if (this.selectedComboKey === comboKey) {
      this.selectedComboKey = null;
      this.selectedTreatmentKeys.clear();
    } else {
      const combo = this.availableCombos.find(c => c.key === comboKey);
      this.selectedComboKey = comboKey;
      this.selectedTreatmentKeys = new Set(combo?.treatmentKeys ?? []);
    }
  }

  isPackageSelected(key: string): boolean {
    return this.selectedPackageKey === key;
  }

  selectPackage(packageKey: string): void {
    this.selectedPackageKey = this.selectedPackageKey === packageKey ? null : packageKey;
  }

  setBookingType(type: AppointmentBookingType): void {
    if (this.bookingType === type) return;
    this.bookingType = type;
    this.selectedTreatmentKeys.clear();
    this.selectedComboKey = null;
    this.selectedPackageKey = null;
  }

  setCategory(category: TreatmentCategory): void {
    this.activeCategory = category;
    this.selectedPackageKey = null;
  }

  get showBaldnessTypes(): boolean {
    return this.bookingType === 'single' && this.activeCategory === 'Hair' && this.baldnessTypeOptions.length > 0;
  }

  get baldnessTypeOptions(): BaldnessType[] {
    return baldnessTypesFor(this.data.lead.gender);
  }

  treatmentsInCategory(category: TreatmentCategory): Treatment[] {
    const gender = this.data.lead.gender;
    return this.availableTreatments.filter(t => t.category === category && (!t.gender || t.gender === 'All' || !gender || t.gender === gender));
  }

  private rawSumFor(keys: string[]): number {
    return keys.reduce((sum, key) => sum + (this.availableTreatments.find(t => t.key === key)?.price ?? 0), 0);
  }

  get priceAfterCombo(): number {
    if (this.selectedComboKey) return this.availableCombos.find(c => c.key === this.selectedComboKey)?.price ?? 0;
    if (this.selectedPackageKey) return this.availablePackages.find(p => p.key === this.selectedPackageKey)?.price ?? 0;
    return this.rawSumFor([...this.selectedTreatmentKeys]);
  }

  get comboSavings(): number {
    if (!this.selectedComboKey) return 0;
    const combo = this.availableCombos.find(c => c.key === this.selectedComboKey);
    if (!combo) return 0;
    return Math.max(0, this.rawSumFor(combo.treatmentKeys) - combo.price);
  }

  get extraDiscountAmount(): number {
    const pct = Number(this.form.get('discountPercent')?.value) || 0;
    return Math.round((this.priceAfterCombo * pct) / 100);
  }

  get appointmentTotal(): number {
    return Math.max(0, this.priceAfterCombo - this.extraDiscountAmount);
  }

  get hasTreatmentSelection(): boolean {
    return this.selectedTreatmentKeys.size > 0 || !!this.selectedComboKey || !!this.selectedPackageKey;
  }

  get serviceLabel(): string {
    if (this.selectedComboKey) return this.availableCombos.find(c => c.key === this.selectedComboKey)?.name ?? '';
    if (this.selectedPackageKey) return this.availablePackages.find(p => p.key === this.selectedPackageKey)?.name ?? '';
    const label = [...this.selectedTreatmentKeys].map(key => this.treatmentName(key)).join(' + ');
    return label || (this.data.appointment?.service ?? '');
  }

  get paymentStatus(): PaymentStatus {
    const paid = Number(this.form.get('amountPaid')?.value) || 0;
    const total = this.appointmentTotal;
    if (total <= 0) return this.data.appointment?.paymentStatus ?? 'Pending';
    if (paid >= total) return 'Paid';
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
    control?.setValue(this.appointmentTotal);
    control?.markAsDirty();
  }

  // ---------------------------------------------------------------------
  // Clinical examination photos (before/after)
  // ---------------------------------------------------------------------

  private imagesFor(target: ClinicalPhotoTarget): string[] {
    return target === 'before' ? this.beforeImages : this.afterImages;
  }

  /** Reads every selected file (from either the camera capture or the plain file picker,
   *  both of which land here through the same `<input type="file">`) into a data URL so the
   *  photo can be previewed/stored without a real upload backend. */
  onPhotoSelected(event: Event, target: ClinicalPhotoTarget): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (target === 'before') this.beforeImages = [...this.beforeImages, dataUrl];
        else this.afterImages = [...this.afterImages, dataUrl];
      };
      reader.readAsDataURL(file);
    });
  }

  removePhoto(target: ClinicalPhotoTarget, index: number): void {
    const images = this.imagesFor(target).filter((_, i) => i !== index);
    if (target === 'before') this.beforeImages = images;
    else this.afterImages = images;

    if (this.imageViewer?.target === target) {
      if (!images.length) this.imageViewer = null;
      else this.imageViewer = { ...this.imageViewer, index: Math.min(this.imageViewer.index, images.length - 1) };
    }
  }

  openImageViewer(target: ClinicalPhotoTarget, index: number): void {
    this.imageViewer = { target, index, title: target === 'before' ? 'Before Photos' : 'After Photos' };
  }

  closeImageViewer(): void {
    this.imageViewer = null;
  }

  get viewerImages(): string[] {
    return this.imageViewer ? this.imagesFor(this.imageViewer.target) : [];
  }

  get viewerImage(): string {
    return this.imageViewer ? this.viewerImages[this.imageViewer.index] ?? '' : '';
  }

  viewerPrev(): void {
    if (!this.imageViewer) return;
    const total = this.viewerImages.length;
    this.imageViewer = { ...this.imageViewer, index: (this.imageViewer.index - 1 + total) % total };
  }

  viewerNext(): void {
    if (!this.imageViewer) return;
    const total = this.viewerImages.length;
    this.imageViewer = { ...this.imageViewer, index: (this.imageViewer.index + 1) % total };
  }

  @HostListener('document:keydown', ['$event'])
  onViewerKeydown(event: KeyboardEvent): void {
    if (!this.imageViewer) return;
    if (event.key === 'Escape') this.closeImageViewer();
    else if (event.key === 'ArrowLeft') this.viewerPrev();
    else if (event.key === 'ArrowRight') this.viewerNext();
  }

  confirmAsClient(): void {
    if (!this.data.appointment) return;

    const value = this.form.getRawValue();
    const appointment: FlowAppointment = {
      ...this.data.appointment,
      service: this.serviceLabel,
      treatmentKeys: [...this.selectedTreatmentKeys],
      comboKey: this.selectedComboKey,
      packageKey: this.selectedPackageKey ?? undefined,
      baldnessType: this.showBaldnessTypes ? (value.baldnessType || undefined) : undefined,
      subtotal: this.priceAfterCombo,
      discountAmount: this.extraDiscountAmount,
      total: this.appointmentTotal,
      doctorNotes: value.doctorNotes ?? '',
      paymentMethod: value.paymentMethod ?? this.data.appointment.paymentMethod,
      paymentStatus: this.paymentStatus,
      beforeImages: this.beforeImages,
      afterImages: this.afterImages,
    };

    this.dialogRef.close({ action: 'confirm-client', lead: this.data.lead, appointment, amountPaid: Number(value.amountPaid) || 0 });
  }

  bookNewAppointment(): void {
    const value = this.form.getRawValue();

    if (!value.apptBranch || !value.apptStaff || !value.apptDate || !value.apptTime) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.hasTreatmentSelection) {
      this.showTreatmentError = true;
      return;
    }
    this.showTreatmentError = false;

    const appointment: FlowAppointment = {
      ...this.data.lead,
      branch: value.apptBranch,
      telecaller: value.apptStaff,
      service: this.serviceLabel,
      date: value.apptDate,
      startTime: value.apptTime,
      staff: value.apptStaff,
      treatmentKeys: [...this.selectedTreatmentKeys],
      comboKey: this.selectedComboKey,
      packageKey: this.selectedPackageKey ?? undefined,
      baldnessType: this.showBaldnessTypes ? (value.baldnessType || undefined) : undefined,
      subtotal: this.priceAfterCombo,
      discountAmount: this.extraDiscountAmount,
      total: this.appointmentTotal,
      doctorNotes: value.doctorNotes ?? '',
      paymentMethod: value.paymentMethod ?? PAYMENT_METHODS[0],
      paymentStatus: this.paymentStatus,
      status: 'Appointment',
      beforeImages: this.beforeImages,
      afterImages: this.afterImages,
    };

    this.dialogRef.close({ action: 'book-appointment', lead: this.data.lead, appointment, amountPaid: Number(value.amountPaid) || 0 });
  }

  // ---------------------------------------------------------------------

  close(): void { this.dialogRef.close({ action: 'close', lead: this.data.lead }); }

  save(action: 'followup' | 'appointment'): void {
    const value = this.form.getRawValue();

    if (!value.telecaller || !value.branch) {
      this.form.markAllAsTouched();
      return;
    }

    if (action === 'appointment') {
      if (!value.scheduleDate || !value.scheduleTime) {
        this.form.markAllAsTouched();
        return;
      }
    } else if (this.isLead && !value.notes) {
      this.form.markAllAsTouched();
      return;
    } else if (this.isFollowUp && !value.notes && this.history.length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    // Don't lose an in-progress note that wasn't explicitly added to the history yet.
    let history = this.history;
    if (this.isFollowUp && value.notes && value.telecaller) {
      const alreadyLogged = history.some(entry => entry.notes === value.notes && entry.telecaller === value.telecaller);
      if (!alreadyLogged) {
        history = [...history, this.buildEntryFromForm(value.telecaller, value.notes)];
      }
    }

    const latestEntry = history[history.length - 1];
    const nextFollowUpDisplay = latestEntry?.nextFollowUpDate
      ? `${this.formatDateDisplay(latestEntry.nextFollowUpDate)}${latestEntry.nextFollowUpTime ? ', ' + this.formatTime(latestEntry.nextFollowUpTime) : ''}`
      : (this.data.lead.followUpDate || '');

    const lead: FlowLead = {
      ...this.data.lead,
      telecaller: value.telecaller ?? '',
      branch: value.branch ?? '',
      notes: value.notes ?? '',
      followUpDate: action === 'appointment' ? (value.scheduleDate ?? '') : nextFollowUpDisplay,
      status: action === 'appointment' ? 'Appointment' : 'Follow-Up',
      history,
    };

    this.dialogRef.close({ action, lead, scheduledDate: value.scheduleDate ?? '', scheduledTime: value.scheduleTime ?? '' });
  }
}
