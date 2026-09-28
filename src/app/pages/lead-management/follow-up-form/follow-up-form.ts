import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { ToastService } from '../../../shared/common-services/toast.service';
import { ApiDataService } from '../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';

@Component({
  selector: 'app-follow-up-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './follow-up-form.html',
  styleUrl: './follow-up-form.scss',
})
export class FollowUpForm {
  followUpForm: FormGroup;
  isSaving = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<FollowUpForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.followUpForm = this.fb.group({
      lead_id: [data?.id ?? '', Validators.required],
      follow_up_date: ['', Validators.required],
      notes: [''],
    });
  }

  saveFollowUp(): void {
    if (this.followUpForm.invalid) {
      this.followUpForm.markAllAsTouched();
      return;
    }

    const formValue = this.followUpForm.getRawValue();
    this.isSaving = true;

    this.apiDataService.POST(ApiRoutesConstants.LEAD_FOLLOWUP_ADD, formValue).subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (response && response.success !== false) {
          this.toast.success('Follow-up scheduled successfully');
          this.dialogRef.close(response.data ?? formValue);
        } else {
          this.toast.error(response?.message || 'Failed to schedule follow-up. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.error(err?.error?.message || 'Failed to schedule follow-up. Please try again.');
        console.error('Failed to schedule follow-up:', err);
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: string): boolean {
    const control = this.followUpForm.get(controlName);
    return !!(
      control &&
      control.invalid &&
      (control.dirty || control.touched)
    );
  }
}
