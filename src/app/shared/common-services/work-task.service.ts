import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { isAdmin } from '../../core/auth/auth.model';
import { AuthService } from '../../core/auth/auth.service';
import { Employee } from '../models/hr.model';
import { WorkTask, isSeoEmployee, isTaskOverdue, taskStats } from '../models/work-task.model';
import { isoDate } from '../utils/format.util';
import { ApiRoutesConstants } from './api-route-constants';
import { BranchContextService } from './branch-context.service';
import { BranchOptionsService } from './branch-options.service';
import { HrService } from './hr.service';

export type WorkTaskInput = Omit<WorkTask, 'id' | 'empId' | 'createdAt' | 'updatedAt'>;

export interface WorkTaskAccess {
  /** admin = dashboard only; seo = logs and updates own tasks; none = no access. */
  role: 'admin' | 'seo' | 'none';
  /** The signed-in user's own HR record (SEO role). */
  employee: Employee | null;
}

/** The message of a failed API call (the server's text when it sent one). */
export function apiErrorMessage(err: any, fallback: string): string {
  const first = err?.error?.errors ? Object.values(err.error.errors as Record<string, string[]>)[0]?.[0] : null;
  return first || err?.error?.message || fallback;
}

/**
 * SEO task tracker, stored on the server (GET/POST/PUT/DELETE hr/tasks). Admin / super admin only view the dashboard; an SEO
 * employee adds and updates their own tasks. Every change goes to the API first and the signal is filled from its response,
 * so ids are the database ids and the audit trail sees each write.
 */
@Injectable({ providedIn: 'root' })
export class WorkTaskService {
  private readonly auth = inject(AuthService);
  private readonly hr = inject(HrService);
  private readonly api = inject(ApiDataService);
  private readonly units = inject(BranchOptionsService);
  private readonly context = inject(BranchContextService);
  private readonly list = signal<WorkTask[]>([]);

  readonly tasks = computed(() => this.list());
  readonly loading = signal(false);
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
    // Load on first use and again whenever the data in force changes (other login, header branch / franchise filter).
    effect(() => {
      this.context.key();
      if (!this.auth.currentUser()) return;
      untracked(() => this.load());
    });
  }

  /** Replaces the list with every task from GET hr/tasks (all pages). Employees are refreshed too: tasks carry database employee ids. */
  load(): void {
    this.loading.set(true);
    const page = (n: number) => this.api.GET(`${ApiRoutesConstants.HR_TASKS}?per_page=200&page=${n}`) as Observable<any>;
    forkJoin([this.hr.loadEmployees().pipe(catchError(() => of([]))), page(1)]).pipe(
      switchMap(([, first]) => {
        const last = Number(first?.pagination?.last_page ?? 1);
        const rest = last > 1 ? forkJoin(Array.from({ length: last - 1 }, (_, i) => page(i + 2))) : of([] as any[]);
        return rest.pipe(map(more => [first, ...more].flatMap(r => (r?.data ?? []) as any[])));
      }),
    ).subscribe({
      next: rows => { this.list.set(rows.map(r => this.fromApi(r))); this.loading.set(false); },
      error: err => { console.error('GET hr/tasks failed', err); this.loading.set(false); },
    });
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

  /** POST hr/tasks. Emits the saved task; errors carry a readable message. */
  add(input: WorkTaskInput): Observable<WorkTask> {
    const a = this.access();
    if (a.role !== 'seo') return throwError(() => new Error('Only an SEO employee can log tasks.'));
    return (this.api.POST(ApiRoutesConstants.HR_TASKS, { ...this.body(input), employee_id: Number(a.employee!.id) }) as Observable<any>).pipe(
      map(res => this.fromApi(res.data)),
      tap(task => this.list.update(l => [task, ...l])),
      catchError(err => throwError(() => new Error(apiErrorMessage(err, 'Could not save the task.')))),
    );
  }

  /** PUT hr/tasks/{id}. */
  update(id: string, input: WorkTaskInput): Observable<WorkTask> {
    const task = this.tasks().find(t => t.id === id);
    if (!task || !this.canEdit(task)) return throwError(() => new Error('You can only update your own tasks.'));
    return (this.api.PUT(`${ApiRoutesConstants.HR_TASKS}/${id}`, this.body(input)) as Observable<any>).pipe(
      map(res => this.fromApi(res.data)),
      tap(saved => this.list.update(l => [saved, ...l.filter(t => t.id !== id)])), // edited -> top
      catchError(err => throwError(() => new Error(apiErrorMessage(err, 'Could not save the task.')))),
    );
  }

  /** DELETE hr/tasks/{id}. */
  remove(id: string): Observable<void> {
    const task = this.tasks().find(t => t.id === id);
    if (!task || !this.canEdit(task)) return throwError(() => new Error('You can only delete your own tasks.'));
    return (this.api.Delete(`${ApiRoutesConstants.HR_TASKS}/${id}`, {}) as Observable<any>).pipe(
      tap(() => this.list.update(l => l.filter(t => t.id !== id))),
      map(() => undefined),
      catchError(err => throwError(() => new Error(apiErrorMessage(err, 'Could not delete the task.')))),
    );
  }

  private body(input: WorkTaskInput): Record<string, unknown> {
    const unit = this.units.byName(input.branch);
    return {
      branch_or_franchise_type: unit?.type ?? null, branch_or_franchise_id: unit?.id ?? null,
      type: input.type, title: input.title, status: input.status, result: input.result, metric: input.metric || null,
      planned_date: input.plannedDate || null, due_date: input.dueDate || null, completed_date: input.completedDate || null, notes: input.notes || null,
    };
  }

  private fromApi(r: any): WorkTask {
    return {
      id: String(r.id),
      empId: String(r.employee_id),
      branch: r.branch?.name ?? this.units.nameOf(r.branch_or_franchise_type, r.branch_or_franchise_id),
      type: r.type ?? '',
      title: r.title ?? '',
      status: r.status,
      result: r.result ?? 'Pending',
      metric: r.metric ?? '',
      plannedDate: r.planned_date ?? '',
      dueDate: r.due_date ?? '',
      completedDate: r.completed_date ?? '',
      notes: r.notes ?? '',
      createdAt: r.created_at ?? '',
      updatedAt: r.updated_at ?? '',
    };
  }
}
