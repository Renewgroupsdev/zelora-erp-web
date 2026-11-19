import { PhoneInput } from '../../../../shared/directives/phone-input.directive';
import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import { ToastService } from '../../../../shared/common-services/toast.service';
import { ApiDataService } from '../../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { HrService, NewEmployeeInput } from '../../../../shared/common-services/hr.service';
import { EMPLOYEE_TYPES, Employee, KYC_ACCEPT, KYC_DOC_TYPES, KYC_MAX_BYTES, KycDocType, KycDocument, REFERRAL_SOURCES, kycNumberLabel, salaryBreakup, structureFromGross } from '../../../../shared/models/hr.model';
import { isoDate, uid } from '../../../../shared/utils/format.util';

/** Add / edit an employee: personal, job, statutory + bank and salary structure. */
@Component({
  selector: 'app-employee-form',
  standalone: true,
  imports: [PhoneInput, CommonModule, FormsModule, MatDialogModule],
  templateUrl: './employee-form.html',
  styleUrl: '../../../../shared/styles/erp-dialog.scss',
})
export class EmployeeForm implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = inject(MatDialogRef<EmployeeForm>);
  /** `branch` pre-selects the branch when adding from Branch Management. */
  private readonly data = inject<{ employee: Employee | null; candidateId?: string; branch?: string }>(MAT_DIALOG_DATA);
  readonly hr = inject(HrService);

  /** Active departments (Settings -> Department Module); the employee's own stays selectable if it was deactivated since. */
  get departments(): string[] {
    const names = this.hr.departments;
    const current = this.model.department;
    return current && !names.includes(current) ? [...names, current] : names;
  }

  constructor() {
    // Fresh GET /departments/options every time the form opens (departments can be added in Settings meanwhile); a new
    // employee defaults to the first one once it has answered.
    this.hr.loadDepartments(true).subscribe(list => { if (!this.model.department && list.length) this.model.department = list[0]; });
  }

  readonly isEdit = !!this.data.employee;
  /** Set when the form is opened from an accepted offer - saving completes the hire. */
  readonly candidateId = this.data.candidateId ?? null;
  readonly submitted = signal(false);

  readonly steps = [
    { label: 'Personal Details', icon: 'bi-person' },
    { label: 'Job Details', icon: 'bi-briefcase' },
    { label: 'KYC Document', icon: 'bi-file-earmark-lock2' },
    { label: 'Statutory & Bank', icon: 'bi-bank' },
    { label: 'Salary Structure', icon: 'bi-cash-stack' },
  ];
  readonly step = signal(0);
  password = '';
  confirmPassword = '';

  model: NewEmployeeInput = this.data.employee
    ? structuredClone((({ id, empCode, status, ...rest }) => rest)(this.data.employee))
    : this.hr.employeeDraftFor(this.candidateId ?? '') ?? {
      name: '', gender: 'Female', dob: null, phone: '', email: '', address: '', bloodGroup: '', photo: '', userType: 'Staff',
      designation: '', department: this.hr.departments[0] ?? '', branch: this.data.branch ?? '', reportingTo: '', joinDate: isoDate(),
      employmentType: 'Full Time', pan: '', aadhaarLast4: '', uan: '', bankName: '', accountNo: '', ifsc: '',
      emergencyContact: '', secondaryPhone: '', referralSource: '', referredBy: '', referralPhone: '', kycDocuments: [],
      salary: structureFromGross(20000),
    };

  readonly employeeTypes = EMPLOYEE_TYPES;
  /** Designation options are the login roles. */
  readonly roles = signal<string[]>([]);
  /** Names of the telecaller-group roles - choosing one as the designation asks for a telephony extension. */
  private readonly telecallerRoles = signal<string[]>([]);
  isTelecaller(): boolean {
    return this.telecallerRoles().includes(this.model.designation);
  }
  /** Same rule as the User form: letters, digits and * # _ - only. */
  extensionInvalid(): boolean {
    const ext = (this.model.extension ?? '').trim();
    return this.isTelecaller() && (!ext || !/^[A-Za-z0-9*#_-]+$/.test(ext) || ext.length > 30);
  }
  readonly photoError = signal<string | null>(null);
  readonly isSaving = signal(false);
  /** Branch or franchise first; the second dropdown then lists only units of that type. */
  readonly unitTypes: { value: 'branch' | 'franchise'; label: string; icon: string }[] = [
    { value: 'branch', label: 'Branch', icon: 'bi-diagram-3' },
    { value: 'franchise', label: 'Franchise', icon: 'bi-shop' },
  ];
  readonly unitType = signal<'branch' | 'franchise'>(
    this.model.branchType ?? (/\(Franchise\)$/.test(this.model.branch ?? '') ? 'franchise' : 'branch'),
  );
  /** Branches / franchises come from the API; the employee stores the unit by name and the API receives its id. */
  readonly branches = computed(() => {
    const type = this.unitType();
    const options = this.hr.branchOptions().filter(b => b.type === type);
    const names = options.map(b => b.name);
    const current = this.model.branch;
    // Keep a saved unit of this type that is no longer on offer (deactivated) selectable.
    const keepCurrent = current && !names.includes(current) && (this.model.branchType ?? 'branch') === type
      && !this.hr.branchOptions().some(b => b.name === current);
    return (keepCurrent ? [current, ...names] : names).map(name => ({
      name,
      label: options.find(o => o.name === name)?.shortName ?? name.replace(/ \(Franchise\)$/, ''),
    }));
  });

  setUnitType(type: 'branch' | 'franchise'): void {
    if (type === this.unitType()) return;
    this.unitType.set(type);
    this.model.branchType = type;
    // A unit of the other type no longer fits: pick the first of the new type (or none).
    const list = this.branches();
    if (!list.some(b => b.name === this.model.branch)) this.model.branch = list[0]?.name ?? '';
  }
  private photoFile: File | null = null;
  private photoRemoved = false;
  private removedKycIds: string[] = [];

  ngOnInit(): void {
    this.model.userType ??= 'Staff';
    if (this.candidateId && !this.data.employee) this.loadCandidateDocuments(this.candidateId);
    this.model.deviceType ||= 'sip';
    // List rows mask the bank account and omit KYC files, so an edit starts from the full record.
    if (this.data.employee) {
      this.hr.fetchEmployee(this.data.employee.id).subscribe({
        next: full => {
          this.model.accountNo = full.accountNo;
          this.model.extension = full.extension;
          this.model.deviceType = full.deviceType || 'sip';
          this.model.sipUsername = full.sipUsername;
          this.model.sipDomain = full.sipDomain;
          this.model.kycDocuments = full.kycDocuments ?? [];
        },
        error: () => this.toast.error('Failed to load the full employee details. Please close and try again.'),
      });
    }
    this.hr.loadBranches().subscribe(list => {
      // The saved unit's type wins (a franchise employee opens on "Franchise").
      const saved = list.find(b => b.name === this.model.branch);
      if (saved) {
        this.unitType.set(saved.type);
        this.model.branchType = saved.type;
      }
      if (!this.model.branch || !saved) {
        if (!this.isEdit && list.length) {
          const pick = list.find(b => b.name === this.data.branch) ?? list.find(b => b.type === this.unitType()) ?? list[0];
          this.unitType.set(pick.type);
          this.model.branchType = pick.type;
          this.model.branch = pick.name;
        }
      }
    });
    this.api.GetAllPages(ApiRoutesConstants.ROLES_GET_List).pipe(catchError(() => of([]))).subscribe((roles: { name: string; slug?: string }[]) => {
      const names = roles.map(r => r.name);
      this.telecallerRoles.set(roles.filter(r => r.slug === 'telecaller').map(r => r.name));
      // Keep a saved designation that is no longer a role selectable instead of blanking it.
      const current = this.model.designation;
      this.roles.set(current && !names.includes(current) ? [current, ...names] : names);
    });
  }

  initials(): string {
    return (this.model.name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
  }

  onPhotoSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return void this.photoError.set('Choose an image file (JPG, PNG, WebP).');
    if (file.size > KYC_MAX_BYTES) return void this.photoError.set('Image must be 1 MB or smaller.');
    this.photoError.set(null);
    this.photoFile = file;
    this.photoRemoved = false;
    const reader = new FileReader();
    reader.onerror = () => this.photoError.set('Could not read the image.');
    reader.onload = () => (this.model.photo = String(reader.result));
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.model.photo = '';
    this.photoFile = null;
    this.photoRemoved = !!this.data.employee?.photo;
  }

  readonly referralSources = REFERRAL_SOURCES;
  readonly kycTypes = KYC_DOC_TYPES;
  readonly kycNo = kycNumberLabel;
  readonly kycAccept = KYC_ACCEPT;
  readonly kycError = signal<string | null>(null);
  kycType: KycDocType = 'Aadhaar';
  kycNumber = '';

  monthlyGross = salaryBreakup(this.model.salary).gross;

  breakup() {
    return salaryBreakup(this.model.salary);
  }

  /** Re-splits the structure from a new monthly gross; components stay editable afterwards. */
  applyGross(): void {
    this.model.salary = structureFromGross(Number(this.monthlyGross) || 0, this.model.salary);
  }

  // ---- Documents the candidate submitted during hiring verification, carried over as KYC documents ----
  readonly docsLoading = signal(false);
  readonly prefillNote = signal<string | null>(null);

  private static readonly VERIFICATION_TO_KYC: Record<string, KycDocType> = {
    'Photo ID (Aadhaar / Passport)': 'Aadhaar',
    'PAN Card': 'PAN',
    'Address Proof': 'Address Proof',
    'Education Certificates': 'Education Certificate',
    'Experience / Relieving Letter': 'Experience Letter',
    'Last 3 Payslips': 'Other',
    'Professional License / Registration': 'Other',
  };

  /** Converting a hired candidate: their uploaded (not rejected) verification documents are loaded into the KYC step. */
  private loadCandidateDocuments(candidateId: string): void {
    this.docsLoading.set(true);
    this.hr.fetchCandidate(candidateId).pipe(
      switchMap(candidate => {
        const docs = (candidate.verification?.documents ?? []).filter(d => d.id && d.status !== 'Rejected');
        if (!docs.length) return of([] as { doc: typeof docs[number]; file: File | null }[]);
        return forkJoin(docs.map(doc => this.hr.candidateDocumentFile(candidateId, doc).pipe(
          map(file => ({ doc, file: file as File | null })),
          catchError(() => of({ doc, file: null as File | null })),
        )));
      }),
      finalize(() => this.docsLoading.set(false)),
    ).subscribe({
      next: results => {
        const skipped: string[] = [];
        let added = 0;
        for (const { doc, file } of results) {
          if (!file || file.size > KYC_MAX_BYTES) { skipped.push(doc.type); continue; }
          if (this.kycDocs.some(k => k.fromVerification && k.fileName === file.name && k.type === (EmployeeForm.VERIFICATION_TO_KYC[doc.type] ?? 'Other'))) continue;
          this.kycDocs.push({
            id: uid('KYC'), type: EmployeeForm.VERIFICATION_TO_KYC[doc.type] ?? 'Other', number: '', fileName: file.name,
            mime: file.type, size: file.size, file, fromVerification: true, uploadedAt: doc.uploadedAt || new Date().toISOString(),
          });
          added++;
        }
        const parts: string[] = [];
        if (added) parts.push(`${added} document${added > 1 ? 's' : ''} loaded from the candidate's verification.`);
        if (skipped.length) parts.push(`Not carried over (missing or larger than 1 MB - upload again): ${skipped.join(', ')}.`);
        this.prefillNote.set(parts.join(' ') || null);
        this.syncStatutory();
      },
      error: () => this.prefillNote.set("The candidate's verification documents could not be loaded. Upload the KYC documents here."),
    });
  }

  /** Aadhaar / PAN number typed on a carried-over document (the file does not give us the number). */
  setKycNumber(doc: KycDocument, value: string): void {
    const raw = String(value ?? '');
    doc.number = doc.type === 'Aadhaar' ? raw.replace(/\D/g, '').slice(0, 12) : raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    this.syncStatutory();
  }

  kycNumberError(doc: KycDocument): string {
    if (!doc.number) return doc.type === 'Aadhaar' ? 'Enter the 12-digit Aadhaar number.' : 'Enter the PAN number.';
    if (doc.type === 'Aadhaar') return doc.number.replace(/\s/g, '').length === 12 ? '' : `Aadhaar needs 12 digits (${doc.number.length}/12).`;
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(doc.number) ? '' : 'PAN format: ABCDE1234F.';
  }

  get kycDocs(): KycDocument[] {
    return (this.model.kycDocuments ??= []);
  }

  /** Reads the chosen file into the employee record (PDF / JPG / PNG, up to 1 MB each). */
  addKyc(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    this.kycError.set(null);
    if (!file) return;
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return void this.kycError.set('Upload a PDF, JPG or PNG file.');
    if (file.size > KYC_MAX_BYTES) return void this.kycError.set('File is larger than 1 MB. Compress it and try again.');
    const number = this.kycNumberValue();
    if (number === null) {
      return void this.kycError.set(this.kycType === 'Aadhaar' ? 'Enter the full 12-digit Aadhaar number before choosing the file.' : 'Enter a valid PAN (ABCDE1234F) before choosing the file.');
    }
    const reader = new FileReader();
    reader.onerror = () => this.kycError.set('Could not read the file.');
    reader.onload = () => {
      this.kycDocs.push({
        id: uid('KYC'), type: this.kycType, number, fileName: file.name,
        mime: file.type, size: file.size, dataUrl: String(reader.result), file, uploadedAt: new Date().toISOString(),
      });
      this.kycNumber = '';
      this.syncStatutory();
    };
    reader.readAsDataURL(file);
  }

  /** Keeps the typed number in format: Aadhaar = 12 digits only, PAN = 10 upper-case letters / digits (ABCDE1234F). */
  onKycNumberChange(value: string): void {
    const raw = String(value ?? '');
    this.kycError.set(null);
    if (this.kycType === 'Aadhaar') this.kycNumber = raw.replace(/D/g, '').slice(0, 12);
    else if (this.kycType === 'PAN') this.kycNumber = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    else this.kycNumber = raw.slice(0, 30);
  }

  /** Inline format hint under the number box while it is typed (empty = fine). */
  get kycNumberHint(): string {
    const n = this.kycNumber;
    if (!n) return '';
    if (this.kycType === 'Aadhaar') return n.length === 12 ? '' : `Aadhaar needs 12 digits (${n.length}/12).`;
    if (this.kycType === 'PAN') return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(n) ? '' : 'PAN format: 5 letters, 4 digits, 1 letter (ABCDE1234F).';
    return '';
  }

  /** Aadhaar (full 12 digits) and PAN are typed here once; Statutory & Bank only mirrors them. */
  private kycNumberValue(): string | null {
    const raw = this.kycNumber.trim().toUpperCase();
    if (this.kycType === 'Aadhaar') {
      const digits = raw.replace(/\s|-/g, '');
      return /^[0-9]{12}$/.test(digits) ? digits.replace(/(\d{4})(?=\d)/g, '$1 ') : null;
    }
    if (this.kycType === 'PAN') return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(raw) ? raw : null;
    return raw;
  }

  /** Picking PAN offers the PAN already on the record (older employees) so it isn't retyped. */
  onKycTypeChange(type: KycDocType): void {
    this.kycType = type;
    this.kycError.set(null);
    this.kycNumber = type === 'PAN' ? this.model.pan : '';
  }

  /** Statutory & Bank Aadhaar (last 4) and PAN follow the latest KYC document of that type. */
  private syncStatutory(): void {
    const latest = (type: KycDocType) => [...this.kycDocs].reverse().find(d => d.type === type)?.number ?? '';
    const aadhaar = latest('Aadhaar').replace(/\s/g, '');
    this.model.aadhaarLast4 = aadhaar.slice(-4);
    this.model.pan = latest('PAN') || (this.kycDocs.some(d => d.type === 'PAN') ? '' : this.model.pan);
  }

  viewKyc(doc: KycDocument): void {
    this.hr.viewKycDocument(this.data.employee?.id ?? '', doc);
  }

  removeKyc(id: string): void {
    // Documents already saved on the server are deleted when the form is saved; picked-but-unsaved ones are just dropped.
    if (!this.kycDocs.find(d => d.id === id)?.file) this.removedKycIds.push(id);
    this.model.kycDocuments = this.kycDocs.filter(d => d.id !== id);
    this.syncStatutory();
  }

  sameAsPrimary(): boolean {
    return !!this.model.secondaryPhone && this.model.secondaryPhone === this.model.phone;
  }

  passwordMismatch(): boolean {
    return this.password !== this.confirmPassword;
  }

  /** Form controls (by `name`) that belong to each step, used to validate a step before moving on. */
  private readonly stepControls: string[][] = [
    ['name', 'phone', 'email', 'secondaryPhone', 'password', 'confirmPassword'],
    ['designation', 'branch', 'joinDate', 'referralPhone'],
    [],
    ['ifsc'],
    [],
  ];

  private stepValid(form: NgForm, index: number): boolean {
    const controlsOk = this.stepControls[index].every(n => !form.controls[n] || form.controls[n].valid);
    return controlsOk
      && (index !== 0 || (!this.sameAsPrimary() && !this.passwordMismatch()))
      && (index !== 1 || !this.extensionInvalid());
  }

  goTo(index: number): void {
    this.step.set(index);
  }

  back(): void {
    this.step.update(s => Math.max(0, s - 1));
  }

  next(form: NgForm): void {
    this.submitted.set(true);
    if (!this.stepValid(form, this.step())) return;
    this.submitted.set(false);
    this.step.update(s => Math.min(this.steps.length - 1, s + 1));
  }

  save(form: NgForm): void {
    // Enter inside an earlier step advances instead of saving.
    if (this.step() < this.steps.length - 1) return this.next(form);
    this.submitted.set(true);
    const invalidStep = this.steps.findIndex((_, i) => !this.stepValid(form, i));
    if (invalidStep >= 0) return this.step.set(invalidStep);
    if (form.invalid || this.isSaving()) return;
    const payload = { ...this.model, pan: this.model.pan.toUpperCase(), ifsc: this.model.ifsc.toUpperCase() };
    this.isSaving.set(true);
    this.hr.saveEmployee(this.data.employee?.id ?? null, payload, {
      photo: this.photoFile, removePhoto: this.photoRemoved, removedKycIds: this.removedKycIds, candidateId: this.candidateId,
      password: this.password || undefined, passwordConfirmation: this.confirmPassword || undefined,
      telecaller: this.isTelecaller(),
    }).pipe(finalize(() => this.isSaving.set(false))).subscribe({
      next: () => {
        // Close the form first so only the success message shows (a hire also closes the candidate dialog behind it).
        this.dialogRef.close(true);
        this.toast.success(this.isEdit ? 'Employee updated successfully' : 'Employee added successfully');
      },
      error: (err: any) => {
        const firstError = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
        this.toast.error(firstError || err?.error?.message || 'Failed to save employee. Please try again.');
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
