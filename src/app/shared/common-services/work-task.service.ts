import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { isAdmin } from '../../core/auth/auth.model';
import { AuthService } from '../../core/auth/auth.service';
import { Employee } from '../models/hr.model';
import { WorkTask, isSeoEmployee, isTaskOverdue, taskStats } from '../models/work-task.model';
import { isoDate, loadState, saveState, uid } from '../utils/format.util';
import { HrService } from './hr.service';

const STORAGE_KEY = 'zelora_work_tasks_v1';

interface WorkTaskState {
  tasks: WorkTask[];
}

export type WorkTaskInput = Omit<WorkTask, 'id' | 'empId' | 'createdAt' | 'updatedAt'>;

export interface WorkTaskAccess {
  /** admin = dashboard only; seo = logs and updates own tasks; none = no access. */
  role: 'admin' | 'seo' | 'none';
  /** The signed-in user's own HR record (SEO role). */
  employee: Employee | null;
}

/**
 * Front-end store for the SEO task tracker (design stage - no API yet). Admin / super admin only view
 * the dashboard; an SEO employee adds and updates their own tasks.
 */
@Injectable({ providedIn: 'root' })
export class WorkTaskService {
  private readonly auth = inject(AuthService);
  private readonly hr = inject(HrService);
  private readonly state = signal<WorkTaskState>(loadState(STORAGE_KEY, () => ({ tasks: [] })));

  readonly tasks = computed(() => this.state().tasks);
  readonly seoEmployees = computed(() => this.hr.activeEmployees().filter(isSeoEmployee));

  readonly access = computed<WorkTaskAccess>(() => {
    const user = this.auth.currentUser();
    const slug = user?.role?.slug ?? '';
    if (isAdmin(user?.role_id) || ['admin', 'super_admin'].includes(slug)) return { role: 'admin', employee: null };
    const me = this.hr.employees().find(e => e.email.toLowerCase() === (user?.email ?? '').toLowerCase() || e.name.toLowerCase() === (user?.name ?? '').toLowerCase());
    if (me && isSeoEmployee(me)) return { role: 'seo', employee: me };
    return { role: 'none', employee: null };
  });

  /** Tasks the signed-in user may see: everyone's (admin) or their own (SEO). */
  readonly visibleTasks = computed(() => {
    const a = this.access();
    if (a.role === 'admin') return this.tasks();
    if (a.role === 'seo') return this.tasks().filter(t => t.empId === a.employee!.id);
    return [];
  });

  /** Open work that needs attention, for the HR tab badge. */
  readonly overdueCount = computed(() => this.visibleTasks().filter(t => isTaskOverdue(t, isoDate())).length);

  constructor() {
    effect(() => saveState(STORAGE_KEY, this.state()));
  }

  forEmployee(empId: string): WorkTask[] {
    return this.tasks().filter(t => t.empId === empId);
  }

  stats(list: WorkTask[]) {
    return taskStats(list, isoDate());
  }

  /** Only the SEO employee themselves may add or edit tasks. */
  canEdit(task: Pick<WorkTask, 'empId'> | null = null): boolean {
    const a = this.access();
    return a.role === 'seo' && (!task || task.empId === a.employee!.id);
  }

  add(input: WorkTaskInput): WorkTask | string {
    const a = this.access();
    if (a.role !== 'seo') return 'Only an SEO employee can log tasks.';
    const now = new Date().toISOString();
    const task: WorkTask = { ...input, id: uid('WT'), empId: a.employee!.id, createdAt: now, updatedAt: now };
    this.mutate(s => s.tasks.push(task));
    return task;
  }

  update(id: string, input: WorkTaskInput): string | null {
    const task = this.tasks().find(t => t.id === id);
    if (!task || !this.canEdit(task)) return 'You can only update your own tasks.';
    this.mutate(s => { s.tasks = s.tasks.map(t => (t.id === id ? { ...t, ...input, updatedAt: new Date().toISOString() } : t)); });
    return null;
  }

  remove(id: string): void {
    const task = this.tasks().find(t => t.id === id);
    if (!task || !this.canEdit(task)) return;
    this.mutate(s => { s.tasks = s.tasks.filter(t => t.id !== id); });
  }

  private mutate(fn: (draft: WorkTaskState) => void): void {
    const draft = structuredClone(this.state());
    fn(draft);
    this.state.set(draft);
  }
}
