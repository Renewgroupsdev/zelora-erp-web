import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { AttendanceMonthSummary, HrService } from '../../../../shared/common-services/hr.service';
import { PageLoader } from '../../../../shared/components/page-loader/page-loader';
import { AttendanceRecord, BREAK_TYPES, breakMinutes, hoursLabel, minutesLabel, workedHours } from '../../../../shared/models/hr.model';
import { displayDate, displayTime, isoDate, monthLabel } from '../../../../shared/utils/format.util';

interface PunchPhoto {
  kind: 'in' | 'out';
  label: string;
  url: string | null;
  time: string | null;
  distanceM: number | null;
  reason: string | null;
}

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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
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

  /** Check-in / check-out selfies of the selected day, with what to print on each card. */
  readonly photos = computed<PunchPhoto[]>(() => {
    const r = this.record();
    if (!r) return [];
    return [
      { kind: 'in', label: 'Check-in', url: r.checkInPhotoUrl ?? null, time: r.checkIn, distanceM: r.distanceM ?? null, reason: null },
      { kind: 'out', label: 'Check-out', url: r.checkOutPhotoUrl ?? null, time: r.checkOut, distanceM: r.checkOutDistanceM ?? null, reason: r.checkOutReason ?? null },
    ];
  });

  /** Photo URLs that failed to load (missing file / storage offline): shown as a placeholder instead of a broken image. */
  readonly failed = signal<ReadonlySet<string>>(new Set());
  /** The photo open in the full-size viewer. */
  readonly viewing = signal<PunchPhoto | null>(null);

  markFailed(url: string): void {
    this.failed.update(s => new Set(s).add(url));
  }

  /** Text for a card without a usable photo. */
  emptyText(p: PunchPhoto): string {
    if (p.url) return 'Photo could not be loaded';
    if (p.time) return 'No selfie for this punch';
    return p.kind === 'in' ? 'Not checked in' : this.date() === this.today ? 'Still working' : 'Not checked out';
  }

  openPhoto(p: PunchPhoto): void {
    if (!p.url || this.failed().has(p.url)) return;
    this.viewing.set(p);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.photo-viewer')?.focus());
  }

  closePhoto(event?: Event): void {
    event?.stopPropagation(); // Escape closes the viewer, not the whole dialog
    this.viewing.set(null);
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
