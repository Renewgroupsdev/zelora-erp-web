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
import { ApiDataService } from '../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';

@Component({
  selector: 'app-add-lead-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-lead-form.html',
  styleUrl: './add-lead-form.scss',
})
export class AddLeadForm {
  leadForm: FormGroup;
  isSaving = false;

  readonly sourceOptions = [
    'Website',
    'Instagram',
    'Facebook',
    'Google Ads',
    'Referral',
    'Walk-in',
    'Call Center',
    'Campaign',
  ];

  readonly genderOptions = [
    {
      value: 'Male',
      label: 'Male',
      icon: 'bi-gender-male',
    },
    {
      value: 'Female',
      label: 'Female',
      icon: 'bi-gender-female',
    },
    {
      value: 'Other',
      label: 'Other',
      icon: 'bi-gender-ambiguous',
    },
  ];

  readonly typeOptions = ['New', 'Existing', 'Corporate'];

  readonly statusOptions = [
    'New',
    'Contacted',
    'Qualified',
    'Lost',
  ];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddLeadForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.leadForm = this.fb.group({
      name: [data?.name ?? '', [Validators.required, Validators.maxLength(100)]],
      phone: [
        data?.phone ?? '',
        [Validators.required, Validators.pattern(/^[0-9+\-\s()]{8,20}$/)],
      ],
      address: [data?.address ?? '', Validators.maxLength(250)],
      location: [data?.location ?? '', Validators.maxLength(100)],
      source: [data?.source ?? '', Validators.required],
      gender: [data?.gender ?? '', Validators.required],
      type: [data?.type ?? '', Validators.required],
      status: [data?.status ?? 'New', Validators.required],
      reason: [data?.reason ?? '', Validators.maxLength(250)],
    });
  }

  get isEdit(): boolean {
    return !!this.data;
  }

  saveLead(): void {
    if (this.leadForm.invalid) {
      this.leadForm.markAllAsTouched();
      return;
    }

    const formValue = this.leadForm.getRawValue();

    // Map this form's field names to the ones the API expects. Note: the form's
    // "location" input is labelled Pin Code, so it maps to `pincode`, while the
    // form's "address" textarea maps to the API's `location` field.
    const payload = {
      name: formValue.name,
      mobile_no: formValue.phone,
      pincode: formValue.location,
      location: formValue.address,
      source: formValue.source,
      gender: formValue.gender,
      category: formValue.type,
      status: formValue.status,
      reason: formValue.reason,
    };

    this.isSaving = true;

    const path = ApiRoutesConstants.LEAD_ADD;
    this.apiDataService.POST(path, payload).subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (response && response.success !== false) {
          this.toast.success(this.isEdit ? 'Lead updated successfully' : 'Lead saved successfully');
          this.dialogRef.close(response.data ?? formValue);
        } else {
          this.toast.error(response || 'Failed to save lead. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.error(err?.error?.message || 'Failed to save lead. Please try again.');
        console.error('Failed to save lead:', err);
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: string): boolean {
    const control = this.leadForm.get(controlName);
    return !!(
      control &&
      control.invalid &&
      (control.dirty || control.touched)
    );
  }
}
