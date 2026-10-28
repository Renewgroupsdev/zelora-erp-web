import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { HrService, NewManpowerInput } from '../../../../shared/common-services/hr.service';
import { isoDate } from '../../../../shared/utils/format.util';

/** Branch / department head raises a vacancy with its salary budget; HR approves it into an open vacancy. */
@Component({
  selector: 'app-manpower-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './manpower-form.html',
  styleUrl: '../../../../shared/styles/erp-dialog.scss',
})
export class ManpowerForm {
  private readonly dialogRef = inject(MatDialogRef<ManpowerForm>);
  readonly hr = inject(HrService);
  /** Active departments (Settings -> Department Module). */
  get departments(): string[] {
    return this.hr.departments;
  }
  readonly today = isoDate();
  readonly submitted = signal(false);
  readonly saving = signal(false);

  model: NewManpowerInput = {
    branch: this.hr.branches[0] ?? '', department: this.hr.departments[0] ?? '', designation: '', positions: 1, employmentType: 'Full Time',
    experience: '1-3 years', budgetMin: 18000, budgetMax: 25000, skills: '', justification: '', replacementFor: '', requiredBy: null,
  };

  constructor() {
    // Fresh GET /departments/options each time the form opens; default to the first department once it has answered.
    this.hr.loadDepartments(true).subscribe(list => { if (!this.model.department && list.length) this.model.department = list[0]; });
    // Default to the first branch once GET /branches/options has answered.
    this.hr.loadBranches().subscribe(list => { if (!this.model.branch && list.length) this.model.branch = list[0].name; });
  }

  monthlyBudget(): number {
    return (Number(this.model.budgetMax) || 0) * (Number(this.model.positions) || 0);
  }

  budgetError(): boolean {
    return Number(this.model.budgetMax) < Number(this.model.budgetMin);
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    if (form.invalid || this.budgetError()) return;
    this.saving.set(true);
    this.hr.createManpower({ ...this.model, positions: Number(this.model.positions), budgetMin: Number(this.model.budgetMin), budgetMax: Number(this.model.budgetMax) }).subscribe({
      next: () => this.dialogRef.close(true),
      error: err => {
        this.saving.set(false);
        Swal.fire({ icon: 'error', title: 'Could not submit the request', text: err?.error?.message ?? 'Please try again.', confirmButtonColor: '#6C63FF' });
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
