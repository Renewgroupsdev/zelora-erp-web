import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../../shared/common-services/toast.service';

@Component({
  selector: 'app-add-lead-status-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-lead-status-form.html',
  styleUrl: './add-lead-status-form.scss',
})
export class AddLeadStatusForm {
  statusForm: FormGroup;
  isSaving = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddLeadStatusForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.statusForm = this.fb.group({
      name: [data?.name ?? '', [Validators.required, Validators.maxLength(100)]],
      status: [this.resolveStatus(data?.status), Validators.required],
    });
  }

  get isEdit(): boolean {
    return !!this.data?.id;
  }

  /** status can come back as "active"/"inactive" (list reads) or "1"/"0" (edit reads) -
   *  the form's select works in the numeric 1/0 that the API expects on write. */
  private resolveStatus(status: unknown): number {
    if (typeof status === 'string') {
      const value = status.trim().toLowerCase();
      if (value === 'active' || value === '1') return 1;
      if (value === 'inactive' || value === '0') return 0;
    }
    return status === 0 ? 0 : 1;
  }

  saveStatus(): void {
    if (this.statusForm.invalid) {
      this.statusForm.markAllAsTouched();
      return;
    }

    const formValue = this.statusForm.getRawValue();
    const payload = {
      name: formValue.name,
      status: Number(formValue.status),
    };

    this.isSaving = true;

    const request = this.isEdit
      ? this.apiDataService.PUT(`${ApiRoutesConstants.LEAD_STATUS_ADD}/${this.data.id}`, payload)
      : this.apiDataService.POST(ApiRoutesConstants.LEAD_STATUS_ADD, payload);

    request.subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (response && response.success !== false) {
          this.toast.success(this.isEdit ? 'Status updated successfully' : 'Status saved successfully');
          this.dialogRef.close(response.data ?? payload);
        } else {
          this.toast.error(response?.message || 'Failed to save status. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.error(err?.error?.message || 'Failed to save status. Please try again.');
        console.error('Failed to save status:', err);
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: string): boolean {
    const control = this.statusForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
