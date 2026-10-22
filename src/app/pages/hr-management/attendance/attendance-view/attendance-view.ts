import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { AttendanceMonthSummary, HrService } from '../../../../shared/common-services/hr.service';
import { PageLoader } from '../../../../shared/components/page-loader/page-loader';
import { AttendanceRecord, BREAK_TYPES, breakMinutes, hoursLabel, minutesLabel, workedHours } from '../../../../shared/models/hr.model';
import { displayDate, displayTime, isoDate, monthLabel } from '../../../../shared/utils/format.util';

/**
 * Read-only view of one employee's attendance. Opens on the clicked date and loads the employee's month from
 * GET /hr/employees/{id}/attendance?month=YYYY-MM (records with breaks + the month summary); picking another
 * day from the month list switches the detail without another request.
 */
@Component({
  selector: 'app-attendance-view',
  standalone: true,
  imports: [CommonModule, MatDialogModule, PageLoader],
  templateUrl: './attendance-view.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './attendance-view.scss'],
})
export class AttendanceView implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<AttendanceView>);
  private readonly data = inject<{ empId: string; date: string }>(MAT_DIALOG_DATA);
  readonly hr = inject(HrService);

  readonly displayDate = displayDate;
  readonly displayTime = displayTime;
  readonly minutesLabel = minutesLabel;
  readonly hoursLabel = hoursLabel;
  readonly today = isoDate();

  readonly loading = signal(true);
  readonly error = signal('');
  readonly date = signal(this.data.date);
  readonly summary = signal<AttendanceMonthSummary | null>(null);
  readonly records = signal<AttendanceRecord[]>([]);

  readonly employee = computed(() => this.hr.employee(this.data.empId));
  readonly record = computed(() => this.records().find(a => a.date === this.date()));

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

  /** Newest first, for the month list under the day detail. */
  readonly monthRecords = computed(() => [...this.records()].sort((a, b) => b.date.localeCompare(a.date)));

  readonly monthName = computed(() => monthLabel(this.data.date.slice(0, 7)));

  /** Pill colour for an attendance status. */
  statusClass(status: string | undefined): string {
    switch (status) {
      case 'Present': return 'green';
      case 'Late': case 'Half Day': return 'orange';
      case 'On Leave': case 'Permission': case 'Holiday': return 'blue';
      default: return 'red'; // Absent / Not Marked
    }
  }

  ngOnInit(): void {
    this.load();
  }

  retry(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    this.hr.fetchEmployeeAttendance(this.data.empId, this.data.date.slice(0, 7))
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ summary, records }) => {
          this.summary.set(summary);
          this.records.set(records);
        },
        error: (err: any) => this.error.set(err?.error?.message || 'Could not load this employee\'s attendance.'),
      });
  }

  select(date: string): void {
    this.date.set(date);
  }

  netOf(r: AttendanceRecord): number {
    const brk = (r.breaks ?? []).reduce((s, b) => s + breakMinutes(b), 0);
    return Math.max(0, workedHours(r) - brk / 60);
  }

  close(): void {
    this.dialogRef.close();
  }
}
