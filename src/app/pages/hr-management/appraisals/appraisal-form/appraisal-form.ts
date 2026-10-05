import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { HrService } from '../../../../shared/common-services/hr.service';
import { BonusType, salaryBreakup } from '../../../../shared/models/hr.model';
import { monthKey } from '../../../../shared/utils/format.util';

/** Suggested increment % per rating - HR can override. */
const INCREMENT_BY_RATING: Record<number, number> = { 1: 0, 2: 3, 3: 6, 4: 10, 5: 15 };

@Component({
  selector: 'app-appraisal-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './appraisal-form.html',
  styleUrl: '../../../../shared/styles/erp-dialog.scss',
})
export class AppraisalForm {
  private readonly dialogRef = inject(MatDialogRef<AppraisalForm>);
  readonly hr = inject(HrService);
  readonly bonusTypes: BonusType[] = ['Performance', 'Festival', 'Retention', 'Referral', 'Joining'];
  readonly year = new Date().getFullYear();
  readonly submitted = signal(false);

  readonly empId = signal(this.hr.activeEmployees().find(e => e.status === 'Active')?.id ?? '');
  readonly employee = computed(() => this.hr.employee(this.empId()));
  readonly currentGross = computed(() => (this.employee() ? salaryBreakup(this.employee()!.salary).gross : 0));

  cycle = `FY ${this.year - 1}-${String(this.year).slice(2)}`;
  rating = 3;
  kpiScore = 75;
  incrementPercent = INCREMENT_BY_RATING[3];
  effectiveFrom = `${this.year}-04-01`;
  strengths = '';
  improvements = '';
  reviewer = this.hr.userName;
  withBonus = false;
  bonusType: BonusType = 'Performance';
  bonusAmount = 0;
  bonusMonth = monthKey();

  setRating(r: number): void {
    this.rating = r;
    this.incrementPercent = INCREMENT_BY_RATING[r];
  }

  newGross(): number {
    return Math.round(this.currentGross() * (1 + (Number(this.incrementPercent) || 0) / 100));
  }

  error(): string | null {
    if (!this.empId()) return 'Select an employee.';
    if (this.kpiScore < 0 || this.kpiScore > 100) return 'KPI score must be 0-100.';
    if (this.incrementPercent < 0 || this.incrementPercent > 100) return 'Increment must be 0-100%.';
    if (this.withBonus && !(this.bonusAmount > 0)) return 'Enter the bonus amount.';
    return null;
  }

  save(): void {
    this.submitted.set(true);
    if (this.error()) return;
    this.hr.createAppraisal({
      empId: this.empId(), cycle: this.cycle, rating: this.rating, kpiScore: Number(this.kpiScore),
      strengths: this.strengths.trim(), improvements: this.improvements.trim(), reviewer: this.reviewer,
      incrementPercent: Number(this.incrementPercent), effectiveFrom: this.effectiveFrom,
      bonus: this.withBonus ? { type: this.bonusType, amount: Number(this.bonusAmount), payMonth: this.bonusMonth } : null,
    });
    this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
