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

@Component({
  selector: 'app-add-lead-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-lead-form.html',
  styleUrl: './add-lead-form.scss',
})
export class AddLeadForm {
  leadForm: FormGroup;

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

    this.dialogRef.close(this.leadForm.getRawValue());
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
