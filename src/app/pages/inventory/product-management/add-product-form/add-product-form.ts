import { CommonModule } from '@angular/common';
import { Component, Inject, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { InventoryService, Product, calculatePricing } from '../../../../shared/common-services/inventory.service';
import { ToastService } from '../../../../shared/common-services/toast.service';

export interface AddProductFormData {
  product: Product | null;
}

@Component({
  selector: 'app-add-product-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-product-form.html',
  styleUrl: './add-product-form.scss',
})
export class AddProductForm {
  private readonly fb = inject(FormBuilder);
  private readonly inventory = inject(InventoryService);
  private readonly toast = inject(ToastService);

  readonly isEdit: boolean;
  readonly vendors = this.inventory.vendors;
  /** Generated once when the dialog opens; existing products keep their code. */
  readonly code: string;

  readonly productForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(255)],
    vendorId: ['', Validators.required],
    purchasePrice: [null as number | null, [Validators.required, Validators.min(0)]],
    marginPercent: [0, [Validators.required, Validators.min(0)]],
    gstPercent: [18, [Validators.required, Validators.min(0), Validators.max(100)]],
    status: ['Active' as 'Active' | 'Inactive'],
  });

  private readonly purchase = toSignal(this.productForm.controls.purchasePrice.valueChanges, { initialValue: this.productForm.controls.purchasePrice.value });
  private readonly margin = toSignal(this.productForm.controls.marginPercent.valueChanges, { initialValue: this.productForm.controls.marginPercent.value });
  private readonly gst = toSignal(this.productForm.controls.gstPercent.valueChanges, { initialValue: this.productForm.controls.gstPercent.value });

  readonly pricing = computed(() => calculatePricing(Number(this.purchase()), Number(this.margin()), Number(this.gst())));

  constructor(
    private dialogRef: MatDialogRef<AddProductForm>,
    @Inject(MAT_DIALOG_DATA) public data: AddProductFormData,
  ) {
    const product = data.product;
    this.isEdit = !!product;
    this.code = product?.code ?? this.inventory.nextProductCode();

    if (product) {
      this.productForm.patchValue({
        name: product.name,
        description: product.description ?? '',
        vendorId: product.vendorId ?? '',
        purchasePrice: product.purchasePrice,
        marginPercent: product.marginPercent,
        gstPercent: product.gstPercent,
        status: product.status,
      });
    }
  }

  saveProduct(): void {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    const raw = this.productForm.getRawValue();
    const product: Product = {
      id: this.data.product?.id ?? this.inventory.newId(),
      code: this.code,
      name: (raw.name ?? '').trim(),
      description: (raw.description ?? '').trim(),
      vendorId: raw.vendorId || null,
      purchasePrice: Number(raw.purchasePrice),
      marginPercent: Number(raw.marginPercent),
      gstPercent: Number(raw.gstPercent),
      ...this.pricing(),
      status: raw.status ?? 'Active',
    };

    this.inventory.saveProduct(product);
    this.toast.success(this.isEdit ? 'Product updated successfully' : 'Product created successfully');
    this.dialogRef.close(product);
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: 'name' | 'description' | 'vendorId' | 'purchasePrice' | 'marginPercent' | 'gstPercent'): boolean {
    const control = this.productForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }
}
