import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { HrService } from '../../../../shared/common-services/hr.service';
import { AttendanceStatus } from '../../../../shared/models/hr.model';
import { displayDate } from '../../../../shared/utils/format.util';

/** HR regularisation of one day: missed punch, wrong status, on-duty, etc. */
@Component({
  selector: 'app-attendance-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  template: `
    <div class="lead-modal">
      <div class="modal-header-custom">
        <div class="modal-title-wrap">
          <div class="title-icon"><i class="bi bi-pencil-square"></i></div>
          <div class="title-content"><h2>Regularise Attendance</h2><p>{{ hr.employeeName(data.empId) }} · {{ displayDate(data.date) }}</p></div>
        </div>
        <button type="button" class="modal-close-btn" aria-label="Close" (click)="close()"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="modal-body-custom">
        <div class="form-grid">
          <div class="form-field full-width">
            <label for="ae-status">Status</label>
            <div class="input-wrap"><i class="bi bi-flag"></i>
              <select id="ae-status" [(ngModel)]="status">@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }</select>
              <i class="bi bi-chevron-down select-arrow"></i>
            </div>
          </div>
          <div class="form-field">
            <label for="ae-in">Check In</label>
            <div class="input-wrap"><i class="bi bi-box-arrow-in-right"></i><input id="ae-in" type="time" [(ngModel)]="inTime" /></div>
          </div>
          <div class="form-field">
            <label for="ae-out">Check Out</label>
            <div class="input-wrap"><i class="bi bi-box-arrow-right"></i><input id="ae-out" type="time" [(ngModel)]="outTime" [class.is-invalid]="timeError" /></div>
            @if (timeError) { <small class="error-text">Check out must be after check in.</small> }
          </div>
          <div class="form-field full-width">
            <label for="ae-remarks">Reason <span>*</span></label>
            <div class="input-wrap"><i class="bi bi-chat-left-dots"></i><input id="ae-remarks" maxlength="200" placeholder="e.g. Biometric not working" [(ngModel)]="remarks" [class.is-invalid]="submitted && !remarks.trim()" /></div>
          </div>
        </div>
      </div>
      <div class="modal-footer-custom">
        <button type="button" class="cancel-btn" (click)="close()">Cancel</button>
        <button type="button" class="save-btn" (click)="save()"><i class="bi bi-check2"></i> Save</button>
      </div>
    </div>
  `,
  styleUrl: '../../../../shared/styles/erp-dialog.scss',
})
export class AttendanceEdit {
  private readonly dialogRef = inject(MatDialogRef<AttendanceEdit>);
  readonly data = inject<{ empId: string; date: string }>(MAT_DIALOG_DATA);
  readonly hr = inject(HrService);
  readonly displayDate = displayDate;
  readonly statuses: AttendanceStatus[] = ['Present', 'Late', 'Half Day', 'Absent', 'On Leave', 'Permission', 'Holiday'];

  private readonly existing = this.hr.attendance().find(a => a.empId === this.data.empId && a.date === this.data.date);
  status: AttendanceStatus = this.existing?.status ?? 'Present';
  inTime = this.toTime(this.existing?.checkIn) ?? '09:30';
  outTime = this.toTime(this.existing?.checkOut) ?? '18:30';
  remarks = this.existing?.remarks ?? '';
  submitted = false;

  get timeError(): boolean {
    return !!this.inTime && !!this.outTime && this.outTime <= this.inTime;
  }

  private toTime(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  save(): void {
    this.submitted = true;
    if (!this.remarks.trim() || this.timeError) return;
    const noPunch = ['Absent', 'On Leave', 'Holiday'].includes(this.status);
    const stamp = (t: string) => (t && !noPunch ? new Date(`${this.data.date}T${t}:00`).toISOString() : null);
    this.hr.markAttendance(this.data.empId, this.data.date, this.status, stamp(this.inTime), stamp(this.outTime), this.remarks.trim());
    this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
