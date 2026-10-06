import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { HrService } from '../../../../shared/common-services/hr.service';
import { WorkTaskInput, WorkTaskService } from '../../../../shared/common-services/work-task.service';
import { WORK_TASK_RESULTS, WORK_TASK_STATUSES, WORK_TASK_TYPES, WorkTask } from '../../../../shared/models/work-task.model';
import { addDays, isoDate } from '../../../../shared/utils/format.util';

/** Log or update one SEO task. Read-only for admins (they only view the dashboard). */
@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './task-form.html',
  styleUrl: '../../../../shared/styles/erp-dialog.scss',
})
export class TaskForm {
  private readonly dialogRef = inject(MatDialogRef<TaskForm>);
  private readonly data = inject<{ taskId?: string }>(MAT_DIALOG_DATA);
  private readonly store = inject(WorkTaskService);
  readonly hr = inject(HrService);

  readonly statuses = WORK_TASK_STATUSES;
  readonly results = WORK_TASK_RESULTS;
  readonly typeGroups = Object.entries(WORK_TASK_TYPES);
  readonly submitted = signal(false);

  readonly existing: WorkTask | null = this.data.taskId ? this.store.tasks().find(t => t.id === this.data.taskId) ?? null : null;
  readonly isEdit = !!this.existing;
  readonly readOnly = !this.store.canEdit(this.existing);
  readonly owner = this.existing ? this.hr.employee(this.existing.empId) : this.store.access().employee;

  model: WorkTaskInput = this.existing
    ? structuredClone((({ id, empId, createdAt, updatedAt, ...rest }) => rest)(this.existing))
    : {
      branch: this.owner?.branch ?? this.hr.branches[0], type: WORK_TASK_TYPES['SEO'][0], title: '', status: 'Not started', result: 'Pending',
      metric: '', plannedDate: isoDate(), dueDate: addDays(isoDate(), 3), completedDate: '', notes: '',
    };

  onStatusChange(): void {
    if (this.model.status === 'Completed' && !this.model.completedDate) this.model.completedDate = isoDate();
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    if (this.readOnly || form.invalid) return;
    const payload = { ...this.model, title: this.model.title.trim(), metric: this.model.metric.trim(), notes: this.model.notes.trim() };
    if (payload.status === 'Completed' && !payload.completedDate) payload.completedDate = isoDate();
    const error = this.existing ? this.store.update(this.existing.id, payload) : (typeof this.store.add(payload) === 'string' ? 'Only an SEO employee can log tasks.' : null);
    if (error) {
      Swal.fire({ icon: 'error', title: 'Could not save', text: error });
      return;
    }
    this.dialogRef.close(true);
  }

  async remove(): Promise<void> {
    if (!this.existing) return;
    const ok = await Swal.fire({ icon: 'warning', title: 'Delete this task?', text: this.existing.title, showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#dc4c4c' });
    if (!ok.isConfirmed) return;
    this.store.remove(this.existing.id);
    this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
