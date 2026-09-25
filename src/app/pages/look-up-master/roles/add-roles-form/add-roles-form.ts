import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../../shared/common-services/toast.service';

@Component({
  selector: 'app-add-roles-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-roles-form.html',
  styleUrl: './add-roles-form.scss',
})
export class AddRolesForm {
  roleForm: FormGroup;
  isSaving = false;
  /** Once the user edits the slug field directly, stop auto-deriving it from the name. */
  private slugTouchedManually = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddRolesForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.slugTouchedManually = this.isEditData(data);

    this.roleForm = this.fb.group({
      name: [data?.name ?? '', [Validators.required, Validators.maxLength(100)]],
      slug: [data?.slug ?? '', [Validators.required, Validators.maxLength(100)]],
      description: [data?.description ?? '', Validators.maxLength(500)],
      status: [this.resolveStatus(data?.status), Validators.required],
    });

    this.roleForm.get('name')?.valueChanges.subscribe((name: string) => {
      if (this.slugTouchedManually) return;
      this.roleForm.get('slug')?.setValue(this.slugify(name), { emitEvent: false });
    });
  }

  get isEdit(): boolean {
    return !!this.data?.id;
  }

  private isEditData(data: any): boolean {
    return !!data?.id;
  }

  onSlugInput(): void {
    this.slugTouchedManually = true;
  }

  private slugify(name: string): string {
    return (name ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /** status can come back as "1"/"0" (list/edit reads) or numeric 1/0 (what we send on write) -
   *  the form's select works in the numeric 1/0 that the API expects on write. */
  private resolveStatus(status: unknown): number {
    if (typeof status === 'string') {
      const value = status.trim().toLowerCase();
      if (value === 'active' || value === '1') return 1;
      if (value === 'inactive' || value === '0') return 0;
    }
    return status === 0 ? 0 : 1;
  }

  saveRole(): void {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    const formValue = this.roleForm.getRawValue();
    const payload = {
      name: formValue.name,
      slug: formValue.slug,
      description: formValue.description || null,
      status: Number(formValue.status),
    };

    this.isSaving = true;

    const request = this.isEdit
      ? this.apiDataService.PUT(`${ApiRoutesConstants.ROLES_ADD}/${this.data.id}`, payload)
      : this.apiDataService.POST(ApiRoutesConstants.ROLES_ADD, payload);

    request.subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (response && response.success !== false) {
          this.toast.success(this.isEdit ? 'Role updated successfully' : 'Role saved successfully');
          this.dialogRef.close(response.data ?? payload);
        } else {
          this.toast.error(response?.message || 'Failed to save role. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.error(err?.error?.message || 'Failed to save role. Please try again.');
        console.error('Failed to save role:', err);
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: string): boolean {
    const control = this.roleForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
