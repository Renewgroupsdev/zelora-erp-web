import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface AddCustomerFormData {
  branches: string[];
  segments: string[];
  serviceOptions: string[];
}

export interface AddCustomerFormResult {
  name: string;
  phone: string;
  email: string;
  gender: string;
  branch: string;
  segment: string;
  preferredService: string;
}

@Component({
  selector: 'app-add-customer-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-customer-form.html',
  styleUrl: './add-customer-form.scss',
})
export class AddCustomerForm {
  customerForm: FormGroup;
  isSaving = false;

  readonly genderOptions = [
    { value: 'Male', label: 'Male', icon: 'bi-gender-male' },
    { value: 'Female', label: 'Female', icon: 'bi-gender-female' },
    { value: 'Other', label: 'Other', icon: 'bi-gender-ambiguous' },
  ];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddCustomerForm, AddCustomerFormResult>,
    @Inject(MAT_DIALOG_DATA) public data: AddCustomerFormData,
  ) {
    this.customerForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9+\-\s()]{8,20}$/)]],
      email: ['', [Validators.email]],
      gender: ['', Validators.required],
      branch: ['', Validators.required],
      segment: ['New', Validators.required],
      preferredService: ['', Validators.required],
    });
  }

  isInvalid(controlName: string): boolean {
    const control = this.customerForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  close(): void {
    this.dialogRef.close();
  }

  save(): void {
    if (this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;

    // No customer API exists yet - simulate the round trip like the other local-state forms.
    setTimeout(() => {
      this.isSaving = false;
      this.dialogRef.close(this.customerForm.getRawValue() as AddCustomerFormResult);
    }, 350);
  }
}
