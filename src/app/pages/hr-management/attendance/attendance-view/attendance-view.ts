import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { HrService } from '../../../../shared/common-services/hr.service';
import { BREAK_TYPES, breakMinutes, hoursLabel, minutesLabel, workedHours } from '../../../../shared/models/hr.model';
import { displayDate, displayTime, isoDate } from '../../../../shared/utils/format.util';

/** Read-only view of one employee's day: punches plus morning break, lunch and evening break. */
@Component({
  selector: 'app-attendance-view',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './attendance-view.html',
  styleUrl: '../../../../shared/styles/erp-dialog.scss',
})
export class AttendanceView {
  private readonly dialogRef = inject(MatDialogRef<AttendanceView>);
  private readonly data = inject<{ empId: string; date: string }>(MAT_DIALOG_DATA);
  readonly hr = inject(HrService);

  readonly displayDate = displayDate;
  readonly displayTime = displayTime;
  readonly minutesLabel = minutesLabel;
  readonly date = this.data.date;
  readonly today = isoDate();
  readonly employee = computed(() => this.hr.employee(this.data.empId));
  readonly record = computed(() => this.hr.attendance().find(a => a.empId === this.data.empId && a.date === this.data.date));

  /** One row per break type, so a skipped break shows as "Not taken". */
  readonly breaks = computed(() => BREAK_TYPES.map(type => {
    const b = this.record()?.breaks?.find(x => x.type === type);
    return { type, start: b?.start ?? null, end: b?.end ?? null, running: !!b && !b.end, minutes: b ? breakMinutes(b) : 0 };
  }));
  readonly totalBreak = computed(() => this.breaks().reduce((s, b) => s + b.minutes, 0));

  readonly worked = computed(() => {
    const r = this.record();
    return r ? workedHours(r) : 0;
  });
  readonly netWorked = computed(() => Math.max(0, this.worked() - this.totalBreak() / 60));
  readonly hoursLabel = hoursLabel;

  close(): void {
    this.dialogRef.close();
  }
}
