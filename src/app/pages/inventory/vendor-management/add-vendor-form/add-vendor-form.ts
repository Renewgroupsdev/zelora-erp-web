import { CommonModule } from '@angular/common';
import { Component, Inject, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { InventoryService, Vendor } from '../../../../shared/common-services/inventory.service';
import { ToastService } from '../../../../shared/common-services/toast.service';

export interface AddVendorFormData {
  vendor: Vendor | null;
}

const GST_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

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
  readonly code: string;
  readonly vendorForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    address: ['', [Validators.required, Validators.maxLength(255)]],
    gstNo: ['', [Validators.required, Validators.pattern(GST_PATTERN)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9+\-\s]{10,15}$/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    status: ['Active' as 'Active' | 'Inactive'],
  });

  constructor(
    private dialogRef: MatDialogRef<AddVendorForm>,
    @Inject(MAT_DIALOG_DATA) public data: AddVendorFormData,
  ) {
    const vendor = data.vendor;
    this.isEdit = !!vendor;
    this.code = vendor?.code ?? this.inventory.nextVendorCode();

    if (vendor) {
      this.vendorForm.patchValue({
        name: vendor.name,
        address: vendor.address,
        gstNo: vendor.gstNo,
        phone: vendor.phone,
        email: vendor.email,
        status: vendor.status,
      });
    }
  }

  saveVendor(): void {
    if (this.vendorForm.invalid) {
      this.vendorForm.markAllAsTouched();
      return;
    }

    const raw = this.vendorForm.getRawValue();
    const vendor: Vendor = {
      id: this.data.vendor?.id ?? this.inventory.newId(),
      code: this.code,
      name: (raw.name ?? '').trim(),
      address: (raw.address ?? '').trim(),
      gstNo: (raw.gstNo ?? '').trim().toUpperCase(),
      phone: (raw.phone ?? '').trim(),
      email: (raw.email ?? '').trim(),
      // Products are mapped from Product Management; editing a vendor keeps its current mapping.
      productIds: this.data.vendor?.productIds ?? [],
      status: raw.status ?? 'Active',
    };

    this.inventory.saveVendor(vendor);
    this.toast.success(this.isEdit ? 'Vendor updated successfully' : 'Vendor created successfully');
    this.dialogRef.close(vendor);
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: 'name' | 'address' | 'gstNo' | 'phone' | 'email'): boolean {
    const control = this.vendorForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }
}
