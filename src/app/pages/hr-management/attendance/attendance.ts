import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { Observable, finalize } from 'rxjs';
import { ToastService } from '../../../shared/common-services/toast.service';
import { isAdmin } from '../../../core/auth/auth.model';
import { AuthService } from '../../../core/auth/auth.service';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { DetailCardData, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { AttendanceRecord, BREAK_TYPES, BreakType, breakMinutes, hoursLabel, minutesLabel, workedHours } from '../../../shared/models/hr.model';
import { saveBlob } from '../../../shared/utils/export.util';
import { displayDate, displayTime, isoDate } from '../../../shared/utils/format.util';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { HrListBase } from '../hr-list-base';
import { AttendanceView } from './attendance-view/attendance-view';

const DAILY_COLUMNS: TableColumn[] = [
  { key: 'empCode', header: 'Emp Code', width: '8%' },
  { key: 'employee', header: 'Employee', width: '17%' },
  { key: 'department', header: 'Department', width: '11%' },
  { key: 'branch', header: 'Branch', type: 'branch', width: '11%' },
  { key: 'checkIn', header: 'Check In', width: '9%' },
  { key: 'checkOut', header: 'Check Out', width: '9%' },
  { key: 'hours', header: 'Worked', width: '8%' },
  { key: 'status', header: 'Status', type: 'badge', width: '9%' },
  { key: 'remarks', header: 'Remarks / Source', width: '12%' },
  { key: 'actions', header: 'Action', type: 'quickActions', width: '6%', sortable: false },
];

const MONTHLY_COLUMNS: TableColumn[] = [
  { key: 'empCode', header: 'Emp Code', width: '8%' },
  { key: 'employee', header: 'Employee', width: '17%' },
  { key: 'branch', header: 'Branch', type: 'branch', width: '11%' },
  { key: 'present', header: 'Present', width: '7%' },
  { key: 'late', header: 'Late', width: '7%' },
  { key: 'half', header: 'Half Day', width: '7%' },
  { key: 'absent', header: 'Absent', width: '7%' },
  { key: 'leave', header: 'Leave', width: '7%' },
  { key: 'permission', header: 'Permission', width: '8%' },
  { key: 'hours', header: 'Total Hours', width: '9%' },
  { key: 'avg', header: 'Avg / Day', width: '8%' },
];

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, ModuleTabs, CanActionDirective],
  templateUrl: './attendance.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', './attendance.scss'],
})
export class Attendance extends HrListBase implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly noun = 'records';

  readonly view = signal<'daily' | 'monthly'>('daily');
  readonly date = signal(isoDate());
  /** Monthly Summary range: opens on the current month so far (1st to today); it can only go back from there. */
  readonly rangeFrom = signal(`${isoDate().slice(0, 7)}-01`);
  readonly rangeTo = signal(isoDate());
  readonly now = signal(new Date());
  readonly today = isoDate();
  readonly displayTime = displayTime;
  readonly displayDate = displayDate;
  /** "01 Oct 2026 – 22 Oct 2026" for the table title. */
  readonly rangeLabel = computed(() => `${displayDate(this.rangeFrom())} – ${displayDate(this.rangeTo())}`);
  readonly hoursLabel = hoursLabel;

  /** Super admin only views the register; every other role punches in and out for themselves. */
  readonly canPunch = computed(() => {
    const user = this.auth.currentUser();
    return !!user && !isAdmin(user.role_id) && user.role?.slug !== 'super_admin';
  });

  private readonly toast = inject(ToastService);
  /** Table heartbeat loader while the register is fetched. */
  readonly loading = signal(false);
  /** Today's punch of the signed-in user (GET /hr/attendance/me fills the store; the API creates the employee from the login if needed). */
  readonly punchRecord = computed(() => {
    this.hr.attendance();
    const id = this.hr.myEmployeeId();
    return id ? this.hr.todayRecord(id) : undefined;
  });
  readonly punching = signal(false);

  override filters = [
    { key: 'status', label: 'Status', options: ['Present', 'Late', 'Half Day', 'Absent', 'On Leave', 'Permission', 'Not Marked'] },
    { key: 'source', label: 'Department', options: this.hr.departments },
    { key: 'branch', label: 'Branch', options: this.hr.branches, multiSelect: true },
  ];

  columns: TableColumn[] = DAILY_COLUMNS;
  override sortActive = 'empCode';
  override sortDirection: 'asc' | 'desc' = 'asc';

  constructor() {
    super();
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  ngOnInit(): void {
    // Row buttons follow Roles & Permissions, which are cached from login: re-read them so a newly ticked action shows without re-login.
    this.auth.refreshMenus();
    this.hr.loadBranches().subscribe(branches => {
      this.filters = this.filters.map(f => (f.key === 'branch' ? { ...f, options: branches.map(b => b.name) } : f));
    });
    this.load(this.hr.loadAttendanceDay(this.date()));
    // Only the View dialog's header (name / designation / branch) uses the employee list.
    this.hr.loadEmployees().subscribe({ error: () => undefined });
    if (this.canPunch()) this.hr.loadMyAttendance().subscribe({ error: () => undefined });
  }

  private load(source: Observable<unknown>): void {
    this.loading.set(true);
    source.pipe(finalize(() => this.loading.set(false))).subscribe({
      error: (err: any) => this.toast.error(err?.error?.message || 'Failed to load attendance. Please try again.'),
    });
  }

  /** Reloads whatever the current view shows: the day's register, or every employee's totals for the range. */
  private reload(): void {
    if (this.view() === 'daily') return this.load(this.hr.loadAttendanceDay(this.date()));
    // One request for every employee: GET /hr/attendance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
    this.load(this.hr.loadAttendanceRange(this.rangeFrom(), this.rangeTo()));
  }

  readonly stats = computed<DetailCardData[]>(() => {
    const s = this.hr.attendanceStats();
    return [
      { label: `Present · ${displayDate(this.date())}`, value: `${s.present} / ${s.total}`, icon: 'bi-person-check-fill', iconVariant: 'green' },
      { label: 'Late Check-ins', value: s.late, icon: 'bi-alarm', iconVariant: 'orange' },
      { label: 'On Leave', value: s.on_leave, icon: 'bi-calendar2-x', iconVariant: 'blue' },
      { label: 'Absent / Not Marked', value: s.absent_or_not_marked, icon: 'bi-person-x', iconVariant: 'purple' },
    ];
  });

  setView(view: 'daily' | 'monthly'): void {
    this.view.set(view);
    this.columns = view === 'daily' ? DAILY_COLUMNS : MONTHLY_COLUMNS;
    this.currentPage = 1;
    this.refresh();
    this.reload();
  }

  setDate(value: string): void {
    if (!value) return;
    this.date.set(value);
    this.reload();
  }

  /** Range start; pulls the end back to it when the start moves past the end. Never later than today. */
  setRangeFrom(value: string): void {
    if (!value) return;
    const from = value > this.today ? this.today : value;
    this.rangeFrom.set(from);
    if (this.rangeTo() < from) this.rangeTo.set(from);
    this.reload();
  }

  /** Range end (up to today); pulls the start back to it when the end moves before the start. */
  setRangeTo(value: string): void {
    if (!value) return;
    const to = value > this.today ? this.today : value;
    this.rangeTo.set(to);
    if (this.rangeFrom() > to) this.rangeFrom.set(to);
    this.reload();
  }

  protected allRows(): TableRow[] {
    const attendance = this.hr.attendance();

    if (this.view() === 'monthly') {
      // Straight from GET /hr/attendance/summary - one row per employee on payroll, totals computed by the API.
      const units = this.hr.branchOptions();
      return this.hr.attendanceMonthly().map(e => ({
        id: e.empId, empCode: e.empCode, employee: e.name, department: e.department,
        branch: units.find(u => u.key === e.unitKey)?.name ?? '',
        present: String(e.present), __present: e.present,
        late: String(e.late), __late: e.late,
        half: String(e.halfDay), __half: e.halfDay,
        absent: String(e.absent), __absent: e.absent,
        leave: String(e.onLeave), __leave: e.onLeave,
        permission: String(e.permission), __permission: e.permission,
        hours: hoursLabel(e.workedHours), __hours: e.workedHours,
        avg: hoursLabel(e.avgHours), __avg: e.avgHours,
        status: '',
      }));
    }

    const date = this.date();
    // The day's register comes straight from GET /hr/attendance (it already lists every employee, punched or not).
    const units = this.hr.branchOptions();
    return this.hr.attendanceRegister().map(e => {
      const a = attendance.find(x => x.empId === e.empId && x.date === date);
      const hours = a ? workedHours(a) : 0;
      return {
        id: e.empId,
        empCode: e.empCode,
        employee: e.name,
        department: e.department,
        branch: units.find(u => u.key === e.unitKey)?.name ?? '',
        checkIn: displayTime(a?.checkIn), __checkIn: a?.checkIn ?? '',
        checkOut: a?.checkIn && !a.checkOut && date === this.today ? 'Working…' : displayTime(a?.checkOut), __checkOut: a?.checkOut ?? '',
        hours: hoursLabel(hours), __hours: hours,
        status: a?.status ?? 'Not Marked',
        remarks: a ? a.remarks || a.source : '-',
        // Shown per Roles & Permissions via [actionPermissions] in attendance.html (view -> view-attendance), like Employees.
        actions: [{ key: 'view', icon: 'bi-eye-fill', label: 'View attendance details', variant: 'primary' }],
      };
    });
  }

  /** View: the dialog loads that employee's attendance (GET /hr/employees/{id}/attendance) for the selected date's month. */
  onQuickAction(event: { row: TableRow; action: string }): void {
    if (event.action === 'view' && this.can('view-attendance')) this.openDialog(AttendanceView, { empId: String(event.row['id']), date: this.view() === 'daily' ? this.date() : this.rangeTo() }, '720px');
  }

  readonly breakTypes = BREAK_TYPES;
  readonly minutesLabel = minutesLabel;

  /** Break currently running on today's punch, if any. */
  readonly openBreak = computed(() => this.punchRecord()?.breaks?.find(b => !b.end) ?? null);

  breakTaken(type: BreakType): boolean {
    return !!this.punchRecord()?.breaks?.some(b => b.type === type);
  }

  breakDuration(): string {
    const b = this.openBreak();
    return b ? minutesLabel(breakMinutes(b, this.now().getTime())) : '';
  }

  /** Runs one punch call; the API's message (e.g. "Lunch has already been taken today.") is shown on failure. */
  private punch(call: Observable<AttendanceRecord>, done: (r: AttendanceRecord) => void): void {
    if (this.punching()) return;
    this.punching.set(true);
    call.pipe(finalize(() => this.punching.set(false))).subscribe({
      next: done,
      error: (err: any) => this.toast.error(err?.error?.message || 'Could not record the punch. Please try again.'),
    });
  }

  startBreak(type: BreakType): void {
    this.punch(this.hr.startBreak(type), () => undefined);
  }

  endBreak(): void {
    this.punch(this.hr.endBreak(), () => undefined);
  }

  checkIn(): void {
    this.punch(this.hr.checkIn(), r => {
      Swal.fire({ toast: true, position: 'top-end', icon: r.status === 'Late' ? 'warning' : 'success', title: r.status === 'Late' ? 'Checked in (late)' : 'Checked in', text: `At ${displayTime(r.checkIn)}`, showConfirmButton: false, timer: 3000 });
    });
  }

  checkOut(): void {
    this.punch(this.hr.checkOut(), r => {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Checked out', text: `Worked ${hoursLabel(workedHours(r))}`, showConfirmButton: false, timer: 3000 });
    });
  }

  liveHours(): string {
    const r = this.punchRecord();
    if (!r?.checkIn) return '0h 00m';
    return hoursLabel(workedHours({ checkIn: r.checkIn, checkOut: r.checkOut ?? this.now().toISOString() }));
  }

  /** GET /hr/attendance/export with the screen's view, date / month and filters; saves the returned file. */
  exportExcel(): void {
    const daily = this.view() === 'daily';
    const f = this.filterState;
    const params: Record<string, string | string[]> = daily ? { view: 'daily', date: this.date() } : { view: 'monthly', from: this.rangeFrom(), to: this.rangeTo() };
    if (this.searchTerm) params['search'] = this.searchTerm;
    if (f.source) params['department'] = [f.source];
    if (daily && f.status) params['status'] = [f.status];
    const keys = f.branch.map(name => this.hr.branchOptions().find(b => b.name === name)?.key).filter((k): k is string => !!k);
    if (keys.length) params['branch_or_franchise_id'] = keys;

    this.hr.exportAttendance(params).subscribe({
      next: blob => saveBlob(blob, daily ? `attendance-${this.date()}.xlsx` : `attendance-summary-${this.rangeFrom()}_${this.rangeTo()}.xlsx`),
      error: () => this.toast.error('Failed to export attendance. Please try again.'),
    });
  }
}
