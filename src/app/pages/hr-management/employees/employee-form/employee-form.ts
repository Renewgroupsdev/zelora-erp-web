import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { catchError, of } from 'rxjs';
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
  private readonly dialogRef = inject(MatDialogRef<EmployeeForm>);
  /** `branch` pre-selects the branch when adding from Branch Management. */
  private readonly data = inject<{ employee: Employee | null; candidateId?: string; branch?: string }>(MAT_DIALOG_DATA);
  readonly hr = inject(HrService);

  readonly departments = DEPARTMENTS;
  readonly isEdit = !!this.data.employee;
  /** Set when the form is opened from an accepted offer - saving completes the hire. */
  readonly candidateId = this.data.candidateId ?? null;
  readonly submitted = signal(false);

  model: NewEmployeeInput = this.data.employee
    ? structuredClone((({ id, empCode, status, ...rest }) => rest)(this.data.employee))
    : this.hr.employeeDraftFor(this.candidateId ?? '') ?? {
      name: '', gender: 'Female', dob: null, phone: '', email: '', address: '', bloodGroup: '', photo: '', userType: 'Staff',
      designation: '', department: DEPARTMENTS[0], branch: this.hr.branches.includes(this.data.branch ?? '') ? this.data.branch! : this.hr.branches[0], reportingTo: '', joinDate: isoDate(),
      employmentType: 'Full Time', pan: '', aadhaarLast4: '', uan: '', bankName: '', accountNo: '', ifsc: '',
      emergencyContact: '', secondaryPhone: '', referralSource: '', referredBy: '', referralPhone: '', kycDocuments: [],
      salary: structureFromGross(20000),
    };

  readonly employeeTypes = EMPLOYEE_TYPES;
  /** Designation options are the login roles. */
  readonly roles = signal<string[]>([]);
  readonly photoError = signal<string | null>(null);

  ngOnInit(): void {
    this.model.userType ??= 'Staff';
    this.api.GetAllPages(ApiRoutesConstants.ROLES_GET_List).pipe(catchError(() => of([]))).subscribe((roles: { name: string }[]) => {
      const names = roles.map(r => r.name);
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
    const reader = new FileReader();
    reader.onerror = () => this.photoError.set('Could not read the image.');
    reader.onload = () => (this.model.photo = String(reader.result));
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.model.photo = '';
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
        mime: file.type, size: file.size, dataUrl: String(reader.result), uploadedAt: new Date().toISOString(),
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

  removeKyc(id: string): void {
    this.model.kycDocuments = this.kycDocs.filter(d => d.id !== id);
    this.syncStatutory();
  }

  sameAsPrimary(): boolean {
    return !!this.model.secondaryPhone && this.model.secondaryPhone === this.model.phone;
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    if (form.invalid || this.sameAsPrimary()) return;
    const payload = { ...this.model, pan: this.model.pan.toUpperCase(), ifsc: this.model.ifsc.toUpperCase() };
    if (this.data.employee) this.hr.updateEmployee(this.data.employee.id, payload);
    else if (this.candidateId) this.hr.createEmployeeFromCandidate(this.candidateId, payload);
    else this.hr.addEmployee(payload);
    this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
