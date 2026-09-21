import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../../shared/common-services/toast.service';

@Component({
  selector: 'app-add-source-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-source-form.html',
  styleUrl: './add-source-form.scss',
})
export class AddSourceForm {
  sourceForm: FormGroup;
  isSaving = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddSourceForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.sourceForm = this.fb.group({
      source_name: [data?.source_name ?? '', [Validators.required, Validators.maxLength(100)]],
      status: [this.resolveStatus(data?.status), Validators.required],
    });
  }

  get isEdit(): boolean {
    return !!this.data?.id;
  }

  /** status comes back as "active"/"inactive" on read - the form's select works in 1/0. */
  private resolveStatus(status: unknown): number {
    if (typeof status === 'string') {
      return status.trim().toLowerCase() === 'active' ? 1 : 0;
    }
    return status === 0 ? 0 : 1;
  }

  saveSource(): void {
    if (this.sourceForm.invalid) {
      this.sourceForm.markAllAsTouched();
      return;
    }

    const formValue = this.sourceForm.getRawValue();
    const payload = {
      source_name: formValue.source_name,
      status: Number(formValue.status),
    };

    this.isSaving = true;

    const request = this.isEdit
      ? this.apiDataService.PUT(`${ApiRoutesConstants.SOURCE_ADD}/${this.data.id}`, payload)
      : this.apiDataService.POST(ApiRoutesConstants.SOURCE_ADD, payload);

    request.subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (response && response.success !== false) {
          this.toast.success(this.isEdit ? 'Source updated successfully' : 'Source saved successfully');
          this.dialogRef.close(response.data ?? payload);
        } else {
          this.toast.error(response?.message || 'Failed to save source. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.error(err?.error?.message || 'Failed to save source. Please try again.');
        console.error('Failed to save source:', err);
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: string): boolean {
    const control = this.sourceForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
