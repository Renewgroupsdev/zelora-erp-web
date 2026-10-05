import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { HrService, NewEmployeeInput } from '../../../../shared/common-services/hr.service';
import { DEPARTMENTS, Employee, salaryBreakup, structureFromGross } from '../../../../shared/models/hr.model';
import { isoDate } from '../../../../shared/utils/format.util';

/** Add / edit an employee: personal, job, statutory + bank and salary structure. */
@Component({
  selector: 'app-employee-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './employee-form.html',
  styleUrl: '../../../../shared/styles/erp-dialog.scss',
})
export class EmployeeForm {
  private readonly dialogRef = inject(MatDialogRef<EmployeeForm>);
  private readonly data = inject<{ employee: Employee | null; candidateId?: string }>(MAT_DIALOG_DATA);
  readonly hr = inject(HrService);

  readonly departments = DEPARTMENTS;
  readonly isEdit = !!this.data.employee;
  /** Set when the form is opened from an accepted offer - saving completes the hire. */
  readonly candidateId = this.data.candidateId ?? null;
  readonly submitted = signal(false);

  model: NewEmployeeInput = this.data.employee
    ? structuredClone((({ id, empCode, status, ...rest }) => rest)(this.data.employee))
    : this.hr.employeeDraftFor(this.candidateId ?? '') ?? {
      name: '', gender: 'Female', dob: null, phone: '', email: '', address: '', bloodGroup: '',
      designation: '', department: DEPARTMENTS[0], branch: this.hr.branches[0], reportingTo: '', joinDate: isoDate(),
      employmentType: 'Full Time', pan: '', aadhaarLast4: '', uan: '', bankName: '', accountNo: '', ifsc: '',
      emergencyContact: '', salary: structureFromGross(20000),
    };

  monthlyGross = salaryBreakup(this.model.salary).gross;

  breakup() {
    return salaryBreakup(this.model.salary);
  }

  /** Re-splits the structure from a new monthly gross; components stay editable afterwards. */
  applyGross(): void {
    this.model.salary = structureFromGross(Number(this.monthlyGross) || 0, this.model.salary);
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    if (form.invalid) return;
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
