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
import { NotificationService } from '../../../shared/common-services/notification.service';

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

  readonly typeOptions = ['Hair', 'Skin', 'Slimming' ];

  readonly statusOptions = [
    'New',
    'Contacted',
    'Qualified',
    'Lost',
  ];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddLeadForm>,
    private toast: ToastService,
    private notifications: NotificationService,
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

    // No live backend for leads yet - build the saved lead locally instead of calling the API.
    // Note: the form's "location" input is labelled Pin Code, so it maps to `pincode`, while
    // the form's "address" textarea maps to the API's `location` field, matching the shape a
    // real lead-add endpoint would return.
    const savedLead = {
      id: this.data?.id ?? Date.now(),
      name: formValue.name,
      mobile_no: formValue.phone,
      pincode: formValue.location,
      location: formValue.address,
      source: formValue.source,
      gender: formValue.gender,
      category: formValue.type,
      status: formValue.status,
      reason: formValue.reason,
      created_at: new Date().toISOString(),
    };

    this.toast.success(this.isEdit ? 'Lead updated successfully' : 'Lead saved successfully');

    if (!this.isEdit) {
      this.notifications.add({
        type: 'lead',
        title: 'New lead added',
        message: `${formValue.name} was added to the pipeline from ${formValue.source || 'an unspecified source'}.`,
        link: '/app/lead-management',
      });
    }

    this.dialogRef.close(savedLead);
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
