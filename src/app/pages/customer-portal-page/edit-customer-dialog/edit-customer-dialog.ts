import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { ImagePick, ImagePicker } from '../../../shared/components/image-picker/image-picker';

export interface EditCustomerData {
  id: number;
  name: string;
}

/** Edit Customer [edit-customer]: loads GET /customers/{id}, saves PUT /customers/{id}; closes with true after a save. */
@Component({
  selector: 'app-edit-customer-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, ImagePicker],
  templateUrl: './edit-customer-dialog.html',
  styleUrl: '../add-customer-form/add-customer-form.scss',
})
export class EditCustomerDialog implements OnInit {
  readonly loading = signal(true);
  readonly saving = signal(false);
  customerCode = '';
  /** Saved photo, and what the form changed about it. */
  photoUrl: string | null = null;
  private photoPick: ImagePick = { file: null, removed: false };
  readonly form: FormGroup;
  /** Field -> first message from the API (422). */
  readonly serverErrors = signal<Record<string, string>>({});

  readonly genderOptions = [
    { value: 'Male', label: 'Male', icon: 'bi-gender-male' },
    { value: 'Female', label: 'Female', icon: 'bi-gender-female' },
    { value: 'Other', label: 'Other', icon: 'bi-gender-ambiguous' },
  ];

  constructor(
    fb: FormBuilder,
    private readonly api: ApiDataService,
    private readonly toast: ToastService,
    private readonly dialogRef: MatDialogRef<EditCustomerDialog, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: EditCustomerData,
  ) {
    this.form = fb.group({
      first_name: ['', [Validators.required, Validators.maxLength(100)]],
      last_name: ['', Validators.maxLength(100)],
      gender: [''],
      date_of_birth: [''],
      mobile_no: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      alternate_mobile_no: ['', Validators.pattern(/^[0-9]{10}$/)],
      email: ['', [Validators.email, Validators.maxLength(150)]],
      address: ['', Validators.maxLength(500)],
      city: ['', Validators.maxLength(100)],
      state: ['', Validators.maxLength(100)],
      pincode: ['', Validators.pattern(/^[1-9][0-9]{5}$/)],
      occupation: ['', Validators.maxLength(100)],
      is_active: [true],
    });
  }

  ngOnInit(): void {
    this.api.GET(`${ApiRoutesConstants.CUSTOMERS}/${this.data.id}`).subscribe({
      next: (res: any) => {
        const c = res?.data ?? {};
        this.customerCode = c.customer_code ?? '';
        this.photoUrl = c.photo_url ?? null;
        this.form.patchValue(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])));
        this.loading.set(false);
      },
      error: (err: any) => {
        this.toast.error('Could not load the customer', err?.error?.message || 'Please try again.');
        this.dialogRef.close(false);
      },
    });
  }

  isInvalid(name: string): boolean {
    const control = this.form.get(name);
    return !!control && ((control.invalid && (control.dirty || control.touched)) || !!this.serverErrors()[name]);
  }

  /** The API's message for a field, else the form's own wording. */
  error(name: string, fallback: string): string {
    return this.serverErrors()[name] ?? fallback;
  }

  onPhoto(pick: ImagePick): void {
    this.photoPick = pick;
  }

  close(): void {
    this.dialogRef.close(false);
  }

  save(): void {
    this.serverErrors.set({});
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    // Empty text -> null so the API clears the field.
    const payload = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v]));

    // Multipart (the photo travels with the form): POST + _method=PUT, booleans as 1 / 0, empty values clear the field.
    const form = new FormData();
    Object.entries(payload).forEach(([k, v]) => form.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : v == null ? '' : String(v)));
    if (this.photoPick.file) form.append('photo', this.photoPick.file);
    if (this.photoPick.removed) form.append('remove_photo', '1');
    form.append('_method', 'PUT');

    this.saving.set(true);
    this.api.POST(`${ApiRoutesConstants.CUSTOMERS}/${this.data.id}`, form).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Customer updated', `${this.data.name} has been updated successfully.`);
        this.dialogRef.close(true);
      },
      error: (err: any) => {
        this.saving.set(false);
        const errors = err?.error?.errors as Record<string, string[]> | undefined;
        if (errors) {
          this.serverErrors.set(Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0]])));
        }
        this.toast.error('Save failed', (errors && Object.values(errors)[0]?.[0]) || err?.error?.message || 'Please try again.');
      },
    });
  }
}
