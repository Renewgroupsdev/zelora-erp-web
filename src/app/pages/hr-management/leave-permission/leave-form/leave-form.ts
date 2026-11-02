import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { finalize } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { HrService } from '../../../../shared/common-services/hr.service';
import { LEAVE_QUOTA, LeaveType } from '../../../../shared/models/hr.model';
import { isoDate } from '../../../../shared/utils/format.util';

/** Apply for leave (full / half day) or a short permission (hours) - goes to HR for approval. */
@Component({
  selector: 'app-leave-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './leave-form.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './leave-form.scss'],
})
export class LeaveForm {
  private readonly dialogRef = inject(MatDialogRef<LeaveForm>);
  private readonly data = inject<{ kind: 'Leave' | 'Permission' }>(MAT_DIALOG_DATA);
  readonly hr = inject(HrService);

  readonly kind = signal<'Leave' | 'Permission'>(this.data.kind);
  readonly leaveTypes = Object.keys(LEAVE_QUOTA) as LeaveType[];
  readonly today = isoDate();
  readonly submitted = signal(false);
  readonly saving = signal(false);

  empId = signal(this.hr.activeEmployees()[0]?.id ?? '');
  leaveType: LeaveType = 'Casual Leave';
  fromDate = this.today;
  toDate = this.today;
  halfDay = false;
  fromTime = '16:00';
  toTime = '18:00';
  reason = '';

  readonly balance = computed(() => this.hr.leaveBalance(this.empId()));

  days(): number {
    return this.hr.leaveDays({ kind: 'Leave', fromDate: this.fromDate, toDate: this.halfDay ? this.fromDate : this.toDate, halfDay: this.halfDay });
  }

  permissionHours(): number {
    const [fh, fm] = this.fromTime.split(':').map(Number);
    const [th, tm] = this.toTime.split(':').map(Number);
    return Math.max(0, (th * 60 + tm - (fh * 60 + fm)) / 60);
  }

  error(): string | null {
    if (!this.empId()) return 'Select an employee.';
    if (!this.reason.trim()) return 'Give a reason.';
    if (this.kind() === 'Permission') {
      const h = this.permissionHours();
      if (h <= 0) return 'To time must be after from time.';
      if (h > 3) return 'Permission is limited to 3 hours - apply for half-day leave instead.';
      return null;
    }
    if (!this.halfDay && this.toDate < this.fromDate) return 'To date cannot be before from date.';
    if (!this.days()) return 'Selected dates fall on holidays.';
    const bal = this.balance().find(b => b.type === this.leaveType);
    if (bal && bal.quota && this.days() > bal.balance) return `Only ${bal.balance} ${this.leaveType} left - choose Loss of Pay for the rest.`;
    return null;
  }

  save(): void {
    this.submitted.set(true);
    if (this.error() || this.saving()) return;
    const isLeave = this.kind() === 'Leave';
    this.saving.set(true);
    this.hr.applyLeave({
      empId: this.empId(),
      kind: this.kind(),
      leaveType: isLeave ? this.leaveType : null,
      fromDate: this.fromDate,
      toDate: isLeave && !this.halfDay ? this.toDate : this.fromDate,
      halfDay: isLeave && this.halfDay,
      fromTime: isLeave ? null : this.fromTime,
      toTime: isLeave ? null : this.toTime,
      reason: this.reason.trim(),
    }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => this.dialogRef.close(true),
      error: err => Swal.fire({ icon: 'error', title: 'Could not submit the request', text: err?.error?.message ?? 'Please try again.', confirmButtonColor: '#6C63FF' }),
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
