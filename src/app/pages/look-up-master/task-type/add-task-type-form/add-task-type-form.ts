import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { DepartmentOptionsService } from '../../../../shared/common-services/department-options.service';
import { ToastService } from '../../../../shared/common-services/toast.service';

interface DeptOption { id: number; name: string }

/**
 * Add / edit one group (parent, shown bold) or task type (child) of the Task type master.
 * `data` is the row being edited, or null for a new one. Group = "None" makes a new group.
 */
@Component({
  selector: 'app-add-task-type-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-task-type-form.html',
  styleUrl: './add-task-type-form.scss',
})
export class AddTaskTypeForm implements OnInit {
  form: FormGroup;
  isSaving = false;
  departments: DeptOption[] = [];
  groups: DeptOption[] = [];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddTaskTypeForm>,
    private api: ApiDataService,
    private toast: ToastService,
    private departmentOptions: DepartmentOptionsService,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    this.form = this.fb.group({
      department_id: [data?.department_id ?? null, Validators.required],
      parent_id: [data?.parent_id ?? null],
      name: [data?.name ?? '', [Validators.required, Validators.maxLength(60)]],
      status: [Number(data?.status ?? 1) === 0 ? 0 : 1, Validators.required],
    });
  }

  get isEdit(): boolean {
    return !!this.data?.id;
  }

  /** Editing a group that still has task types: it cannot become a task type, so the Group dropdown stays "None". */
  get isGroup(): boolean {
    return !this.form.value.parent_id;
  }

  ngOnInit(): void {
    // GET /departments/options has ids; the shared service only keeps names, so ask for the id list here.
    this.api.GET(ApiRoutesConstants.DEPARTMENT_OPTIONS).subscribe((res: any) => {
      this.departments = res?.data ?? [];
      if (!this.form.value.department_id && this.departments.length) this.form.patchValue({ department_id: this.departments[0].id });
      this.loadGroups();
    });
  }

  onDepartmentChange(): void {
    this.form.patchValue({ parent_id: null });
    this.loadGroups();
  }

  private loadGroups(): void {
    const dept = this.form.value.department_id;
    if (!dept) { this.groups = []; return; }
    this.api.GET(`${ApiRoutesConstants.TASK_TYPE_PARENTS}?department_id=${dept}`).subscribe((res: any) => {
      // A group cannot be its own parent.
      this.groups = ((res?.data ?? []) as DeptOption[]).filter(g => g.id !== this.data?.id);
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload = {
      department_id: Number(v.department_id),
      parent_id: v.parent_id ? Number(v.parent_id) : null,
      name: String(v.name).trim(),
      status: Number(v.status),
    };
    if (!payload.name) {
      this.form.get('name')?.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const request = this.isEdit ? this.api.PUT(`${ApiRoutesConstants.TASK_TYPES}/${this.data.id}`, payload) : this.api.POST(ApiRoutesConstants.TASK_TYPES, payload);
    request.subscribe({
      next: (res: any) => {
        this.isSaving = false;
        if (res && res.success !== false) {
          this.toast.success(this.isEdit ? 'Task type updated successfully' : 'Task type saved successfully');
          this.dialogRef.close(res.data ?? payload);
        } else {
          this.toast.error(res?.message || 'Failed to save task type. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        const e = err?.error?.errors;
        this.toast.error(e?.name?.[0] || e?.parent_id?.[0] || e?.department_id?.[0] || err?.error?.message || 'Failed to save task type. Please try again.');
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(control: string): boolean {
    const c = this.form.get(control);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }
}
