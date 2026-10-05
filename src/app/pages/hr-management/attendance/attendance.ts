import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { canViewTeamAttendance, isAdmin } from '../../../core/auth/auth.model';
import { AuthService } from '../../../core/auth/auth.service';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { DetailCardData, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { BREAK_TYPES, BreakType, DEPARTMENTS, breakMinutes, hoursLabel, minutesLabel, workedHours } from '../../../shared/models/hr.model';
import { downloadExcel } from '../../../shared/utils/export.util';
import { displayDate, displayTime, isoDate, monthLabel } from '../../../shared/utils/format.util';
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
  { key: 'remarks', header: 'Remarks / Source', width: '18%' },
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
  imports: [CommonModule, FormsModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, ModuleTabs],
  templateUrl: './attendance.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', './attendance.scss'],
})
export class Attendance extends HrListBase {
  private readonly auth = inject(AuthService);
  protected readonly noun = 'records';

  readonly view = signal<'daily' | 'monthly'>('daily');
  readonly date = signal(isoDate());
  readonly month = signal(isoDate().slice(0, 7));
  readonly now = signal(new Date());
  readonly today = isoDate();
  readonly displayTime = displayTime;
  readonly displayDate = displayDate;
  readonly monthLabel = monthLabel;
  readonly hoursLabel = hoursLabel;

  /** Super admin only views the register; every other role punches in and out for themselves. */
  readonly canPunch = computed(() => {
    const user = this.auth.currentUser();
    return !!user && !isAdmin(user.role_id) && user.role?.slug !== 'super_admin';
  });

  /** The signed-in user's own employee record; created from the login on first visit if there isn't one. */
  readonly myEmployee = computed(() => {
    const user = this.auth.currentUser();
    if (!user || !this.canPunch()) return undefined;
    const email = user.email?.trim().toLowerCase();
    const list = this.hr.employees().filter(e => e.status !== 'Exited');
    return list.find(e => !!email && e.email.trim().toLowerCase() === email) ?? list.find(e => e.name.trim().toLowerCase() === user.name?.trim().toLowerCase());
  });
  readonly punchVersion = signal(0);
  readonly punchRecord = computed(() => {
    this.punchVersion();
    this.hr.attendance();
    const me = this.myEmployee();
    return me ? this.hr.todayRecord(me.id) : undefined;
  });

  override filters = [
    { key: 'status', label: 'Status', options: ['Present', 'Late', 'Half Day', 'Absent', 'On Leave', 'Permission', 'Not Marked'] },
    { key: 'source', label: 'Department', options: DEPARTMENTS },
    { key: 'branch', label: 'Branch', options: this.hr.branches, multiSelect: true },
  ];

  /** Branch managers / heads, admins and super admins get a View action to open anyone's day. */
  readonly canViewDetails = computed(() => canViewTeamAttendance(this.auth.currentUser()));

  columns: TableColumn[] = this.dailyColumns();
  override sortActive = 'empCode';
  override sortDirection: 'asc' | 'desc' = 'asc';

  constructor() {
    super();
    effect(() => {
      const user = this.auth.currentUser();
      if (user && this.canPunch() && !this.myEmployee()) untracked(() => this.hr.ensureEmployeeForLogin(user));
    });
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  readonly stats = computed<DetailCardData[]>(() => {
    const day = this.hr.attendance().filter(a => a.date === this.date());
    const count = (...s: string[]) => day.filter(a => s.includes(a.status)).length;
    const total = this.hr.activeEmployees().filter(e => e.status !== 'Onboarding').length;
    return [
      { label: `Present · ${displayDate(this.date())}`, value: `${count('Present', 'Late', 'Half Day', 'Permission')} / ${total}`, icon: 'bi-person-check-fill', iconVariant: 'green' },
      { label: 'Late Check-ins', value: count('Late'), icon: 'bi-alarm', iconVariant: 'orange' },
      { label: 'On Leave', value: count('On Leave'), icon: 'bi-calendar2-x', iconVariant: 'blue' },
      { label: 'Absent / Not Marked', value: total - count('Present', 'Late', 'Half Day', 'Permission', 'On Leave'), icon: 'bi-person-x', iconVariant: 'purple' },
    ];
  });

  private dailyColumns(): TableColumn[] {
    const allowed = canViewTeamAttendance(this.auth.currentUser());
    return allowed ? [...DAILY_COLUMNS, { key: 'actions', header: 'Action', type: 'quickActions', width: '6%', sortable: false }] : DAILY_COLUMNS;
  }

  setView(view: 'daily' | 'monthly'): void {
    this.view.set(view);
    this.columns = view === 'daily' ? this.dailyColumns() : MONTHLY_COLUMNS;
    this.currentPage = 1;
    this.refresh();
  }

  setDate(value: string): void {
    if (!value) return;
    this.date.set(value);
    this.refresh();
  }

  setMonth(value: string): void {
    if (!value) return;
    this.month.set(value);
    this.refresh();
  }

  protected allRows(): TableRow[] {
    const employees = this.hr.activeEmployees().filter(e => e.status !== 'Onboarding');
    const attendance = this.hr.attendance();

    if (this.view() === 'monthly') {
      const month = this.month();
      return employees.map(e => {
        const list = attendance.filter(a => a.empId === e.id && a.date.startsWith(month));
        const count = (s: string) => list.filter(a => a.status === s).length;
        const hours = list.reduce((s, a) => s + workedHours(a), 0);
        const days = list.filter(a => a.checkOut).length;
        return {
          id: e.id, empCode: e.empCode, employee: e.name, department: e.department, branch: e.branch,
          present: String(count('Present')), __present: count('Present'),
          late: String(count('Late')), __late: count('Late'),
          half: String(count('Half Day')), __half: count('Half Day'),
          absent: String(count('Absent')), __absent: count('Absent'),
          leave: String(count('On Leave')), __leave: count('On Leave'),
          permission: String(count('Permission')), __permission: count('Permission'),
          hours: hoursLabel(hours), __hours: Math.round(hours * 100) / 100,
          avg: hoursLabel(days ? hours / days : 0), __avg: days ? Math.round((hours / days) * 100) / 100 : 0,
          status: '',
        };
      });
    }

    const date = this.date();
    return employees.map(e => {
      const a = attendance.find(x => x.empId === e.id && x.date === date);
      const hours = a ? workedHours(a) : 0;
      return {
        id: e.id,
        empCode: e.empCode,
        employee: e.name,
        department: e.department,
        branch: e.branch,
        checkIn: displayTime(a?.checkIn), __checkIn: a?.checkIn ?? '',
        checkOut: a?.checkIn && !a.checkOut && date === this.today ? 'Working…' : displayTime(a?.checkOut), __checkOut: a?.checkOut ?? '',
        hours: hoursLabel(hours), __hours: hours,
        status: a?.status ?? 'Not Marked',
        remarks: a ? a.remarks || a.source : '-',
        actions: this.canViewDetails() ? [{ key: 'view', icon: 'bi-eye-fill', label: 'View attendance details' }] : [],
      };
    });
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    if (event.action === 'view' && this.canViewDetails()) this.openDialog(AttendanceView, { empId: event.row['id'], date: this.date() }, '640px');
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

  startBreak(type: BreakType): void {
    const me = this.myEmployee();
    if (me && this.hr.startBreak(me.id, type)) this.punchVersion.update(v => v + 1);
  }

  endBreak(): void {
    const me = this.myEmployee();
    if (me && this.hr.endBreak(me.id)) this.punchVersion.update(v => v + 1);
  }

  checkIn(): void {
    const me = this.myEmployee();
    if (!me) return;
    const r = this.hr.checkIn(me.id);
    this.punchVersion.update(v => v + 1);
    Swal.fire({ toast: true, position: 'top-end', icon: r.status === 'Late' ? 'warning' : 'success', title: r.status === 'Late' ? 'Checked in (late)' : 'Checked in', text: `${me.name} at ${displayTime(r.checkIn)}`, showConfirmButton: false, timer: 3000 });
  }

  checkOut(): void {
    const me = this.myEmployee();
    if (!me) return;
    const r = this.hr.checkOut(me.id);
    this.punchVersion.update(v => v + 1);
    if (r) Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Checked out', text: `Worked ${hoursLabel(workedHours(r))}`, showConfirmButton: false, timer: 3000 });
  }

  liveHours(): string {
    const r = this.punchRecord();
    if (!r?.checkIn) return '0h 00m';
    return hoursLabel(workedHours({ checkIn: r.checkIn, checkOut: r.checkOut ?? this.now().toISOString() }));
  }

  exportExcel(): void {
    const sheet = this.exportSheet(this.view() === 'daily' ? `Attendance ${this.date()}` : `Summary ${this.month()}`);
    downloadExcel(this.view() === 'daily' ? `attendance-${this.date()}` : `attendance-summary-${this.month()}`, [sheet]);
  }
}
