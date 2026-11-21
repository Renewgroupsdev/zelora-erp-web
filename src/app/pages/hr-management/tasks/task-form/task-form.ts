import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { RecordHistory } from '../../../../shared/components/record-history/record-history';
import { HrService } from '../../../../shared/common-services/hr.service';
import { WorkTaskInput, WorkTaskService } from '../../../../shared/common-services/work-task.service';
import { DepartmentOptionsService } from '../../../../shared/common-services/department-options.service';
import { TaskTypeGroup, TaskTypeOptionsService } from '../../../../shared/common-services/task-type-options.service';
import { GroupedSelect, SelectGroup } from '../../../../shared/components/grouped-select/grouped-select';
import { WORK_TASK_RESULTS, WORK_TASK_STATUSES, WorkTask } from '../../../../shared/models/work-task.model';
import { addDays, isoDate } from '../../../../shared/utils/format.util';

/** Log or update one task. Read-only when it is not the signed-in employee's own task. */
@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, RecordHistory, GroupedSelect],
  templateUrl: './task-form.html',
  styleUrl: '../../../../shared/styles/erp-dialog.scss',
})
export class TaskForm {
  private readonly dialogRef = inject(MatDialogRef<TaskForm>);
  private readonly data = inject<{ taskId?: string }>(MAT_DIALOG_DATA);
  private readonly store = inject(WorkTaskService);
  readonly hr = inject(HrService);
  private readonly departmentOptions = inject(DepartmentOptionsService);
  private readonly taskTypes = inject(TaskTypeOptionsService);

  readonly statuses = WORK_TASK_STATUSES;
  readonly results = WORK_TASK_RESULTS;
  readonly departments = this.departmentOptions.names;
  /** Task type master of the chosen department: bold groups with their task types underneath. */
  private readonly masterGroups = signal<TaskTypeGroup[]>([]);
  readonly typesLoading = signal(false);
  readonly submitted = signal(false);
  readonly saving = signal(false);

  readonly existing: WorkTask | null = this.data.taskId ? this.store.tasks().find(t => t.id === this.data.taskId) ?? null : null;
  readonly isEdit = !!this.existing;
  readonly readOnly = !this.store.canEdit(this.existing);
  readonly owner = this.existing ? this.hr.employee(this.existing.empId) : this.store.access().employee;

  model: WorkTaskInput = this.existing
    ? structuredClone((({ id, empId, createdAt, updatedAt, ...rest }) => rest)(this.existing))
    : {
      branch: this.owner?.branch ?? this.hr.branches[0] ?? '', type: '', title: '', status: 'Not started', result: 'Pending',
      metric: '', plannedDate: isoDate(), dueDate: addDays(isoDate(), 3), completedDate: '', notes: '',
    };

  /** Bound from the signed-in employee's department (or the task owner's); an admin without an employee record picks one. */
  department = this.owner?.department ?? '';
  /** Fixed for anyone with a department of their own; only an admin without one can pick. */
  readonly departmentLocked = !!this.owner?.department || this.readOnly;

  /** Dropdown groups; a saved type that is no longer in the master stays visible under "Current". */
  readonly typeGroups = computed<SelectGroup[]>(() => {
    const groups = this.masterGroups().map(g => ({ label: g.name, items: g.children.map(c => c.name) }));
    const type = this.typeName();
    const known = groups.some(g => g.label === type || g.items.includes(type));
    return type && !known ? [...groups, { label: 'Current', items: [type] }] : groups;
  });
  private readonly typeName = signal(this.existing?.type ?? '');

  constructor() {
    this.departmentOptions.ensure();
    if (!this.department) {
      this.departmentOptions.load().subscribe(names => { if (!this.department && names.length) { this.department = names[0]; this.loadTypes(); } });
    }
    this.loadTypes();
    // Default to the first branch once GET /branches/options has answered.
    this.hr.loadBranches().subscribe(list => { if (!this.model.branch && list.length) this.model.branch = list[0].name; });
  }

  onDepartmentChange(): void {
    this.model.type = '';
    this.typeName.set('');
    this.loadTypes();
  }

  onTypeChange(value: string): void {
    this.model.type = value;
    this.typeName.set(value);
  }

  private loadTypes(): void {
    this.typesLoading.set(true);
    this.taskTypes.forDepartment(this.department).subscribe(groups => {
      this.masterGroups.set(groups);
      this.typesLoading.set(false);
      if (!this.model.type && !this.existing) this.onTypeChange(groups[0]?.children[0]?.name ?? groups[0]?.name ?? '');
    });
  }

  onStatusChange(): void {
    if (this.model.status === 'Completed' && !this.model.completedDate) this.model.completedDate = isoDate();
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    if (this.readOnly || form.invalid) return;
    const payload = { ...this.model, title: this.model.title.trim(), metric: this.model.metric.trim(), notes: this.model.notes.trim() };
    if (payload.status === 'Completed' && !payload.completedDate) payload.completedDate = isoDate();
    if (this.saving()) return;
    this.saving.set(true);
    (this.existing ? this.store.update(this.existing.id, payload) : this.store.add(payload)).subscribe({
      next: () => { this.saving.set(false); this.dialogRef.close(true); },
      error: (err: Error) => {
        this.saving.set(false);
        Swal.fire({ icon: 'error', title: 'Could not save', text: err.message });
      },
    });
  }

  async remove(): Promise<void> {
    if (!this.existing) return;
    const ok = await Swal.fire({ icon: 'warning', title: 'Delete this task?', text: this.existing.title, showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#dc4c4c' });
    if (!ok.isConfirmed) return;
    this.store.remove(this.existing.id).subscribe({
      next: () => this.dialogRef.close(true),
      error: (err: Error) => Swal.fire({ icon: 'error', title: 'Could not delete', text: err.message }),
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
