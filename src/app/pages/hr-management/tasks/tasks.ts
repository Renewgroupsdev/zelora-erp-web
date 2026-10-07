import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HrService } from '../../../shared/common-services/hr.service';
import { WorkTaskService } from '../../../shared/common-services/work-task.service';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { ALL_WORK_TASK_TYPES, WORK_TASK_STATUSES, WorkTask, isTaskOverdue } from '../../../shared/models/work-task.model';
import { downloadExcel } from '../../../shared/utils/export.util';
import { addDays, displayDate, isoDate } from '../../../shared/utils/format.util';
import { hrTabs } from '../hr-list-base';
import { TaskForm } from './task-form/task-form';

type Period = 'thisweek' | 'thismonth' | 'lastmonth' | 'all';

/** SEO task dashboard: admin views every SEO employee; an SEO employee logs and updates their own tasks. */
@Component({
  selector: 'app-hr-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, ModuleTabs],
  templateUrl: './tasks.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', './tasks.scss'],
})
export class Tasks {
  private readonly dialog = inject(MatDialog);
  private readonly hr = inject(HrService);
  protected readonly store = inject(WorkTaskService);

  readonly tabs = computed(() => hrTabs(this.hr));
  readonly access = this.store.access;
  readonly statuses = WORK_TASK_STATUSES;
  readonly displayDate = displayDate;
  readonly today = isoDate();

  readonly period = signal<Period>('thismonth');
  readonly branch = signal('');
  readonly employeeId = signal('');
  readonly status = signal('');
  readonly search = signal('');

  private periodRange(): [string, string] | null {
    const now = new Date();
    const p = this.period();
    if (p === 'all') return null;
    if (p === 'thisweek') {
      const monday = addDays(this.today, -((now.getDay() + 6) % 7));
      return [monday, addDays(monday, 6)];
    }
    const month = p === 'thismonth' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return [isoDate(month), isoDate(new Date(month.getFullYear(), month.getMonth() + 1, 0))];
  }

  /** Tasks in scope of the signed-in user, the chosen period and employee (any branch). */
  readonly periodScoped = computed(() => {
    const range = this.periodRange();
    return this.store.visibleTasks().filter(t =>
      (!range || (!!t.dueDate && t.dueDate >= range[0] && t.dueDate <= range[1]))
      && (!this.employeeId() || t.empId === this.employeeId()));
  });

  /** Same, narrowed to the chosen branch. */
  readonly scoped = computed(() => this.periodScoped().filter(t => !this.branch() || t.branch === this.branch()));

  /** Admin dashboard shows every location; opening a card switches to that location's tracker. */
  readonly locationOpen = signal(false);
  readonly adminDashboard = computed(() => this.access().role === 'admin' && !this.locationOpen());

  openLocation(branch: string): void {
    this.branch.set(branch);
    this.status.set('');
    this.search.set('');
    this.locationOpen.set(true);
  }

  backToLocations(): void {
    this.branch.set('');
    this.locationOpen.set(false);
  }

  /** One card per branch: progress, members and who is responsible (SEO employees working or based there). */
  readonly locationCards = computed(() => this.hr.branches.map(branch => {
    const list = this.periodScoped().filter(t => t.branch === branch);
    const all = this.store.visibleTasks().filter(t => t.branch === branch);
    const names = new Set<string>(all.map(t => this.employeeName(t.empId)));
    for (const e of this.store.seoEmployees()) if (e.branch === branch) names.add(e.name);
    return { branch, stats: this.store.stats(list), members: new Set(list.map(t => t.empId)).size, responsible: [...names].sort() };
  }));

  /** Every task type with the people working on it and their progress (admin overview). */
  readonly serviceRows = computed(() => {
    const list = this.periodScoped();
    const types = [...ALL_WORK_TASK_TYPES, ...new Set(list.map(t => t.type).filter(t => !ALL_WORK_TASK_TYPES.includes(t)))];
    return types.map(type => {
      const ofType = list.filter(t => t.type === type);
      const people = [...new Set(ofType.map(t => t.empId))].map(id => {
        const mine = ofType.filter(t => t.empId === id);
        return { name: this.employeeName(id), branches: [...new Set(mine.map(t => t.branch))].join(', '), done: mine.filter(t => t.status === 'Completed').length, total: mine.length, overdue: mine.filter(t => isTaskOverdue(t, this.today)).length };
      });
      return { type, stats: this.store.stats(ofType), people };
    });
  });

  readonly stats = computed(() => this.store.stats(this.scoped()));

  /** One card per SEO employee (admin) or just the signed-in employee (SEO). */
  readonly employeeCards = computed(() => {
    const a = this.access();
    const people = a.role === 'admin' ? this.store.seoEmployees() : a.employee ? [a.employee] : [];
    return people
      .filter(e => !this.employeeId() || e.id === this.employeeId())
      .map(e => ({ employee: e, stats: this.store.stats(this.scoped().filter(t => t.empId === e.id)) }));
  });

  readonly byType = computed(() => {
    const types = [...new Set(this.scoped().map(t => t.type))].sort();
    return types.map(type => ({ type, stats: this.store.stats(this.scoped().filter(t => t.type === type)) }));
  });

  readonly attention = computed(() => this.scoped()
    .filter(t => isTaskOverdue(t, this.today) || t.status === 'Blocked')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)));

  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.scoped()
      .filter(t => (!this.status() || (this.status() === 'Overdue' ? isTaskOverdue(t, this.today) : t.status === this.status()))
        && (!q || [t.title, t.type, t.metric, t.notes, this.employeeName(t.empId)].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  });

  readonly branches = this.hr.branches;

  employeeName(empId: string): string {
    return this.hr.employee(empId)?.name ?? 'Former employee';
  }

  statusClass(t: WorkTask): string {
    if (t.status === 'Completed') return 'green';
    if (isTaskOverdue(t, this.today)) return 'red';
    if (t.status === 'Blocked') return 'orange';
    return t.status === 'In progress' ? 'blue' : 'grey';
  }

  statusLabel(t: WorkTask): string {
    return isTaskOverdue(t, this.today) ? `Overdue · ${t.status}` : t.status;
  }

  resultClass(r: string): string {
    return ({ Achieved: 'green', 'Partially achieved': 'orange', 'Not achieved': 'red' } as Record<string, string>)[r] ?? 'grey';
  }

  open(taskId?: string): void {
    this.dialog.open(TaskForm, { width: '860px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { taskId } });
  }

  exportExcel(): void {
    downloadExcel(`seo-tasks-${this.today}`, [{
      name: 'SEO Tasks',
      columns: [
        { header: 'Employee', key: 'emp' }, { header: 'Branch', key: 'branch' }, { header: 'Task type', key: 'type' }, { header: 'Task', key: 'title' },
        { header: 'Planned start', key: 'start' }, { header: 'Due date', key: 'due' }, { header: 'Status', key: 'status' }, { header: 'Completed on', key: 'done' },
        { header: 'Result status', key: 'result' }, { header: 'Result / metric', key: 'metric' }, { header: 'Notes', key: 'notes' },
      ],
      rows: this.rows().map(t => ({ emp: this.employeeName(t.empId), branch: t.branch, type: t.type, title: t.title, start: t.plannedDate, due: t.dueDate, status: this.statusLabel(t), done: t.completedDate, result: t.result, metric: t.metric, notes: t.notes })),
    }]);
  }
}
