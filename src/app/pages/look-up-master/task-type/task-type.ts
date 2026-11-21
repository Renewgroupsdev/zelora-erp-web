import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { Observable, finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { DepartmentOptionsService } from '../../../shared/common-services/department-options.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { LocalListBase } from '../../../shared/components/local-list-base';
import { AutoModuleTabs } from '../../../shared/components/module-tabs/auto-module-tabs';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { FilterOption, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { displayDate } from '../../../shared/utils/format.util';
import { AddTaskTypeForm } from './add-task-type-form/add-task-type-form';

/** Settings -> Task Type Module: the groups (parents) and task types (children) behind the Task & Tracker "Task type" dropdown, per department. */
@Component({
  selector: 'app-task-type',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, MatDialogModule, CommonFilterCard, CommonTableCard, CanActionDirective],
  templateUrl: './task-type.html',
  styleUrl: './task-type.scss',
})
export class TaskTypeMaster extends LocalListBase implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly departmentOptions = inject(DepartmentOptionsService);

  protected readonly noun = 'task types';

  // The filter card has fixed keys: `source` is reused for the department.
  protected override filterFields = { status: 'status', source: 'department', branch: ['branch'] };
  override filters: FilterOption[] = [
    { key: 'source', label: 'Department', options: this.departmentOptions.nameList },
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
  ];

  columns: TableColumn[] = [
    { key: 'department', header: 'Department', type: 'text', width: '20%' },
    { key: 'group', header: 'Group', type: 'text', width: '25%' },
    { key: 'name', header: 'Task Type', type: 'text', width: '25%' },
    { key: 'status', header: 'Status', type: 'badge', width: '10%' },
    { key: 'created_at', header: 'Created Date', type: 'text', width: '10%' },
    { key: 'action', header: 'Action', type: 'rowActions', width: '10%', sortable: false },
  ];

  override sortActive = '';
  override sortDirection: 'asc' | 'desc' = 'asc';

  /** Raw rows from GET /task-types (every page), already in department / group / task type order. */
  private readonly items = signal<any[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.departmentOptions.ensure();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    (this.api.GetAllPages(ApiRoutesConstants.TASK_TYPE_LIST) as Observable<any[]>)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: rows => {
          this.items.set(rows);
          this.currentPage = 1;
        },
        error: (err: any) => this.toast.error(err?.error?.message || 'Failed to load task types. Please try again.'),
      });
  }

  protected allRows(): TableRow[] {
    return this.items().map(t => ({
      id: t.id,
      department: t.department ?? '',
      // A group row shows its own name under Group and a dash under Task Type; a task type shows its group.
      group: t.parent_id ? (t.parent ?? '') : (t.name ?? ''),
      name: t.parent_id ? (t.name ?? '') : '—',
      status: Number(t.status) === 1 ? 'Active' : 'Inactive',
      created_at: t.created_at ? displayDate(String(t.created_at).slice(0, 10)) : '', __created_at: t.created_at ?? '',
    }));
  }

  openAddPopup(taskType: any = null): void {
    this.openDialog(AddTaskTypeForm, taskType, '460px').afterClosed().subscribe(result => {
      if (result) this.load();
    });
  }

  onEditTaskType(row: TableRow): void {
    const id = Number(row['id']);
    this.api.GET(`${ApiRoutesConstants.TASK_TYPES}/${id}`).subscribe({
      next: (res: any) => this.openAddPopup(res?.success ? res.data : this.items().find(t => t.id === id) ?? null),
      error: () => this.toast.error('Failed to load task type details. Please try again.'),
    });
  }

  async onDeleteTaskType(row: TableRow): Promise<void> {
    const isGroup = row['name'] === '—';
    const label = isGroup ? row['group'] : row['name'];
    const confirmed = await this.toast.confirm(
      isGroup ? 'Delete this group?' : 'Delete this task type?',
      isGroup ? `${label} and every task type under it will be removed.` : `${label} will be removed.`,
    );
    if (!confirmed) return;

    this.api.Delete(`${ApiRoutesConstants.TASK_TYPES}/${row['id']}`, {}).subscribe({
      next: (res: any) => {
        if (res && res.success !== false) {
          this.toast.success('Task type deleted successfully');
          this.load();
        } else {
          this.toast.error(res?.message || 'Failed to delete task type. Please try again.');
        }
      },
      // 422 when tasks still use it: the API says how many.
      error: (err: any) => this.toast.error(err?.error?.message || 'Failed to delete task type. Please try again.'),
    });
  }
}
