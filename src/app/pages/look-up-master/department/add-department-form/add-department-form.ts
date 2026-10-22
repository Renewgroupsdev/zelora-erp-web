import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../../shared/common-services/toast.service';

/** Add / edit one department (Settings -> Department Module). `data` is the department being edited, or null for a new one. */
@Component({
  selector: 'app-add-department-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-department-form.html',
  styleUrl: './add-department-form.scss',
})
export class AddDepartmentForm {
  departmentForm: FormGroup;
  isSaving = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddDepartmentForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    this.departmentForm = this.fb.group({
      name: [data?.name ?? '', [Validators.required, Validators.maxLength(100)]],
      status: [Number(data?.status ?? 1) === 0 ? 0 : 1, Validators.required],
    });
  }

  get isEdit(): boolean {
    return !!this.data?.id;
  }

  saveDepartment(): void {
    if (this.departmentForm.invalid) {
      this.departmentForm.markAllAsTouched();
      return;
    }

    const value = this.departmentForm.getRawValue();
    const payload = { name: String(value.name).trim(), status: Number(value.status) };
    if (!payload.name) {
      this.departmentForm.get('name')?.setErrors({ required: true });
      this.departmentForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const request = this.isEdit
      ? this.apiDataService.PUT(`${ApiRoutesConstants.DEPARTMENTS}/${this.data.id}`, payload)
      : this.apiDataService.POST(ApiRoutesConstants.DEPARTMENTS, payload);

    request.subscribe({
      next: (response: any) => {
        this.isSaving = false;
        if (response && response.success !== false) {
          this.toast.success(this.isEdit ? 'Department updated successfully' : 'Department saved successfully');
          this.dialogRef.close(response.data ?? payload);
        } else {
          this.toast.error(response?.message || 'Failed to save department. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        // 422: show the field message ("The name has already been taken.") rather than the generic one.
        this.toast.error(err?.error?.errors?.name?.[0] || err?.error?.message || 'Failed to save department. Please try again.');
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: string): boolean {
    const control = this.departmentForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
