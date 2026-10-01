import { CommonModule } from '@angular/common';
import { Component, Inject, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { InventoryService, VendorPayload, VendorRecord } from '../../../../shared/common-services/inventory.service';
import { ToastService } from '../../../../shared/common-services/toast.service';

export interface AddVendorFormData {
  vendor: VendorRecord | null;
}

const GST_PATTERN = /^\d{2}[A-Za-z]{5}\d{4}[A-Za-z][0-9A-Za-z]Z[0-9A-Za-z]$/;

@Component({
  selector: 'app-add-vendor-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-vendor-form.html',
  styleUrl: './add-vendor-form.scss',
})
export class AddVendorForm {
  private readonly fb = inject(FormBuilder);
  private readonly inventory = inject(InventoryService);
  private readonly toast = inject(ToastService);

  readonly isEdit: boolean;
  readonly isSaving = signal(false);
  /** Shown read-only when editing; new vendors get their code from the API on save. */
  readonly code: string;

  readonly vendorForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    address: ['', [Validators.required]],
    gstNo: ['', [Validators.required, Validators.pattern(GST_PATTERN)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10,15}$/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    status: ['Active' as 'Active' | 'Inactive'],
  });

  constructor(
    private dialogRef: MatDialogRef<AddVendorForm>,
    @Inject(MAT_DIALOG_DATA) public data: AddVendorFormData,
  ) {
    const vendor = data.vendor;
    this.isEdit = !!vendor;
    this.code = vendor?.code ?? '';

    if (vendor) {
      this.vendorForm.patchValue({
        name: vendor.name,
        address: vendor.address,
        gstNo: vendor.gst_no,
        phone: vendor.phone,
        email: vendor.email,
        status: vendor.status,
      });
    }
  }

  saveVendor(): void {
    if (this.isSaving()) return;

    if (this.vendorForm.invalid) {
      this.vendorForm.markAllAsTouched();
      return;
    }

    const raw = this.vendorForm.getRawValue();
    const payload: VendorPayload = {
      name: (raw.name ?? '').trim(),
      address: (raw.address ?? '').trim(),
      gst_no: (raw.gstNo ?? '').trim().toUpperCase(),
      phone: (raw.phone ?? '').trim(),
      email: (raw.email ?? '').trim(),
      status: raw.status ?? 'Active',
    };

    this.isSaving.set(true);
    const request$ = this.data.vendor
      ? this.inventory.updateVendor(this.data.vendor.id, payload)
      : this.inventory.createVendor(payload);

    request$.subscribe({
      next: (res: any) => {
        this.isSaving.set(false);
        if (res?.success === false) {
          this.toast.error(res?.message || 'Failed to save vendor. Please try again.');
          return;
        }
        this.toast.success(this.isEdit ? 'Vendor updated successfully' : 'Vendor created successfully');
        this.dialogRef.close(res?.data ?? true);
      },
      error: (err: any) => {
        this.isSaving.set(false);
        const errors = err?.error?.errors as Record<string, string[]> | undefined;
        const firstError = errors ? Object.values(errors)[0]?.[0] : undefined;
        this.toast.error(firstError || err?.error?.message || 'Failed to save vendor. Please try again.');
        console.error('Failed to save vendor:', err);
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: 'name' | 'address' | 'gstNo' | 'phone' | 'email'): boolean {
    const control = this.vendorForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }
}
