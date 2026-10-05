import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { HrService, NewManpowerInput } from '../../../../shared/common-services/hr.service';
import { DEPARTMENTS } from '../../../../shared/models/hr.model';
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
  readonly departments = DEPARTMENTS;
  readonly today = isoDate();
  readonly submitted = signal(false);

  model: NewManpowerInput = {
    branch: this.hr.branches[0], department: DEPARTMENTS[0], designation: '', positions: 1, employmentType: 'Full Time',
    experience: '1-3 years', budgetMin: 18000, budgetMax: 25000, skills: '', justification: '', replacementFor: '', requiredBy: null,
  };

  monthlyBudget(): number {
    return (Number(this.model.budgetMax) || 0) * (Number(this.model.positions) || 0);
  }

  budgetError(): boolean {
    return Number(this.model.budgetMax) < Number(this.model.budgetMin);
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    if (form.invalid || this.budgetError()) return;
    this.hr.createManpower({ ...this.model, positions: Number(this.model.positions), budgetMin: Number(this.model.budgetMin), budgetMax: Number(this.model.budgetMax) });
    this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
