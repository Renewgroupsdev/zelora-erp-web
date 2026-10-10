import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { catchError, finalize, of } from 'rxjs';
import { ToastService } from '../../../../shared/common-services/toast.service';
import { ApiDataService } from '../../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { HrService, NewEmployeeInput } from '../../../../shared/common-services/hr.service';
import { DEPARTMENTS, EMPLOYEE_TYPES, Employee, KYC_ACCEPT, KYC_DOC_TYPES, KYC_MAX_BYTES, KycDocType, KycDocument, REFERRAL_SOURCES, kycNumberLabel, salaryBreakup, structureFromGross } from '../../../../shared/models/hr.model';
import { isoDate, uid } from '../../../../shared/utils/format.util';

/** Add / edit an employee: personal, job, statutory + bank and salary structure. */
@Component({
  selector: 'app-employee-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
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

  readonly departments = DEPARTMENTS;
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
      designation: '', department: DEPARTMENTS[0], branch: this.data.branch ?? '', reportingTo: '', joinDate: isoDate(),
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
  /** Branches come from the API; the employee stores the branch by name and the API receives its id. */
  readonly branches = computed(() => {
    const names = this.hr.branchOptions().map(b => b.name);
    const current = this.model.branch;
    return current && !names.includes(current) ? [current, ...names] : names;
  });
  private photoFile: File | null = null;
  private photoRemoved = false;
  private removedKycIds: string[] = [];

  ngOnInit(): void {
    this.model.userType ??= 'Staff';
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
      if (!this.model.branch || !list.some(b => b.name === this.model.branch)) {
        if (!this.isEdit && list.length) this.model.branch = list.find(b => b.name === this.data.branch)?.name ?? list[0].name;
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
        this.toast.success(this.isEdit ? 'Employee updated successfully' : 'Employee added successfully');
        this.dialogRef.close(true);
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
