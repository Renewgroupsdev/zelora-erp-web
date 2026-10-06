import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { HrService } from '../../../../shared/common-services/hr.service';
import { WorkTaskService } from '../../../../shared/common-services/work-task.service';
import { isSeoEmployee, isTaskOverdue } from '../../../../shared/models/work-task.model';
import { hoursLabel, kycNumberLabel, salaryBreakup, workedHours } from '../../../../shared/models/hr.model';
import { displayDate, displayTime, initials, monthKey, monthLabel } from '../../../../shared/utils/format.util';
import { PayslipView } from '../../payroll/payslip-view/payslip-view';
import { TaskForm } from '../../tasks/task-form/task-form';
import { EmployeeForm } from '../employee-form/employee-form';

type ProfileTab = 'overview' | 'salary' | 'attendance' | 'leave' | 'payslips' | 'appraisals' | 'tasks';

/** Everything HR knows about one employee, in one place. */
@Component({
  selector: 'app-employee-profile',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './employee-profile.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './employee-profile.scss'],
})
export class EmployeeProfile {
  private readonly dialogRef = inject(MatDialogRef<EmployeeProfile>);
  private readonly dialog = inject(MatDialog);
  private readonly data = inject<{ empId: string; tab?: ProfileTab }>(MAT_DIALOG_DATA);
  readonly hr = inject(HrService);
  readonly work = inject(WorkTaskService);
  readonly kycNo = kycNumberLabel;

  readonly tab = signal<ProfileTab>(this.data.tab ?? 'overview');
  private readonly baseTabs: { key: ProfileTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'bi-person-vcard' },
    { key: 'salary', label: 'Salary', icon: 'bi-cash-stack' },
    { key: 'attendance', label: 'Attendance', icon: 'bi-fingerprint' },
    { key: 'leave', label: 'Leave', icon: 'bi-calendar2-x' },
    { key: 'payslips', label: 'Payslips', icon: 'bi-file-earmark-text' },
    { key: 'appraisals', label: 'Appraisals & Bonus', icon: 'bi-award' },
  ];
  /** SEO employees get an extra Tasks tab with their task tracker. */
  readonly tabs = this.baseTabs.concat(isSeoEmployee(this.hr.employee(this.data.empId) ?? { department: '', designation: '' }) ? [{ key: 'tasks' as ProfileTab, label: 'Tasks', icon: 'bi-list-check' }] : []);

  readonly displayDate = displayDate;
  readonly displayTime = displayTime;
  readonly initials = initials;
  readonly monthLabel = monthLabel;
  readonly hoursLabel = hoursLabel;
  readonly workedHours = workedHours;

  readonly employee = computed(() => this.hr.employee(this.data.empId)!);
  readonly breakup = computed(() => salaryBreakup(this.employee().salary));
  readonly attendance = computed(() => this.hr.attendance().filter(a => a.empId === this.data.empId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 31));
  readonly monthSummary = computed(() => {
    const month = monthKey();
    const list = this.hr.attendance().filter(a => a.empId === this.data.empId && a.date.startsWith(month));
    const count = (s: string) => list.filter(a => a.status === s).length;
    const hours = list.reduce((s, a) => s + workedHours(a), 0);
    return { present: count('Present'), late: count('Late'), half: count('Half Day'), absent: count('Absent'), leave: count('On Leave'), avg: list.length ? hours / Math.max(1, list.filter(a => a.checkOut).length) : 0 };
  });
  readonly tasks = computed(() => this.work.forEmployee(this.data.empId).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')));
  readonly taskStats = computed(() => this.work.stats(this.tasks()));
  readonly isOverdue = (t: { status: string; dueDate: string }) => isTaskOverdue(t as never, new Date().toISOString().slice(0, 10));
  readonly leaves = computed(() => this.hr.leaves().filter(l => l.empId === this.data.empId));
  readonly balance = computed(() => this.hr.leaveBalance(this.data.empId));
  readonly payslips = computed(() => this.hr.payslips().filter(p => p.empId === this.data.empId).sort((a, b) => b.month.localeCompare(a.month)));
  readonly appraisals = computed(() => this.hr.appraisals().filter(a => a.empId === this.data.empId));
  readonly bonuses = computed(() => this.hr.bonuses().filter(b => b.empId === this.data.empId));
  readonly tenure = computed(() => {
    const months = Math.max(0, Math.floor((Date.now() - new Date(this.employee().joinDate).getTime()) / (30.44 * 86400000)));
    return months >= 12 ? `${Math.floor(months / 12)} yr ${months % 12} mo` : `${months} mo`;
  });

  statusClass(status: string): string {
    return ({ Active: 'green', Present: 'green', Approved: 'green', Paid: 'green', Released: 'green', Onboarding: 'blue', Permission: 'blue', 'On Leave': 'blue', Processed: 'blue', Late: 'orange', 'Half Day': 'orange', Pending: 'orange', Draft: 'orange', 'On Notice': 'orange', Absent: 'red', Rejected: 'red', Exited: 'red' } as Record<string, string>)[status] ?? '';
  }

  openTask(taskId?: string): void {
    this.dialog.open(TaskForm, { width: '860px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { taskId } });
  }

  edit(): void {
    this.dialog.open(EmployeeForm, { width: '900px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { employee: this.employee() } });
  }

  openPayslip(payslipId: string): void {
    this.dialog.open(PayslipView, { width: '820px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, data: { payslipId } });
  }

  close(): void {
    this.dialogRef.close();
  }
}
