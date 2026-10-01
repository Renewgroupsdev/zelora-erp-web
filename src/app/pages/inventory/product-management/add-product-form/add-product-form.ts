import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Inject, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { InventoryService, ProductPayload, ProductRecord } from '../../../../shared/common-services/inventory.service';
import { ToastService } from '../../../../shared/common-services/toast.service';
import { catchError, combineLatest, map, debounceTime, distinctUntilChanged, filter, of, startWith, switchMap } from 'rxjs';

export interface AddProductFormData {
  product: ProductRecord | null;
  vendors: { id: number; name: string }[];
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
  private readonly destroyRef = inject(DestroyRef);

  readonly isEdit: boolean;
  readonly isSaving = signal(false);
  readonly vendors: { id: number; name: string }[];
  /** Shown read-only when editing; new products get their code from the API on save. */
  readonly code: string;

  readonly productForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(255)],
    vendorId: [null as number | null, Validators.required],
    purchasePrice: [null as number | null, [Validators.required, Validators.min(0)]],
    marginPercent: [0, [Validators.required, Validators.min(0)]],
    discountPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    gstPercent: [18, [Validators.required, Validators.min(0), Validators.max(100)]],
    status: ['Active' as 'Active' | 'Inactive'],
  });

  /** Selling price, GST amount and total - always calculated by the API. */
  readonly pricing = signal({ sellingPrice: 0, discountAmount: 0, gstAmount: 0, totalAmount: 0 });

  constructor(
    private dialogRef: MatDialogRef<AddProductForm>,
    @Inject(MAT_DIALOG_DATA) public data: AddProductFormData,
  ) {
    const product = data.product;
    this.isEdit = !!product;
    this.code = product?.code ?? '';

    // An inactive vendor is not in the dropdown list, but the product may still point at it.
    const vendors = [...(data.vendors ?? [])];
    if (product?.vendor && !vendors.some(v => v.id === product.vendor!.id)) vendors.push(product.vendor);
    this.vendors = vendors;

    if (product) {
      this.productForm.patchValue({
        name: product.name,
        description: product.description ?? '',
        vendorId: product.vendor_id,
        purchasePrice: Number(product.purchase_price),
        marginPercent: Number(product.margin_percent),
        discountPercent: Number(product.discount_percent ?? 0),
        gstPercent: Number(product.gst_percent),
        status: product.status,
      });
    }

    this.watchPricing();
  }

  /**
   * Re-asks the API for the pricing breakdown whenever purchase price, margin or GST % changes.
   * switchMap cancels the in-flight request when a newer edit arrives, so a slow older
   * response can never overwrite the latest numbers.
   */
  private watchPricing(): void {
    const c = this.productForm.controls;
    const current = () => ({
      purchase_price: c.purchasePrice.value,
      margin_percent: c.marginPercent.value,
      discount_percent: c.discountPercent.value,
      gst_percent: c.gstPercent.value,
    });

    combineLatest([
      c.purchasePrice.valueChanges.pipe(startWith(c.purchasePrice.value)),
      c.marginPercent.valueChanges.pipe(startWith(c.marginPercent.value)),
      c.discountPercent.valueChanges.pipe(startWith(c.discountPercent.value)),
      c.gstPercent.valueChanges.pipe(startWith(c.gstPercent.value)),
    ]).pipe(
      debounceTime(300),
      map(() => current()),
      filter(v => [v.purchase_price, v.margin_percent, v.discount_percent, v.gst_percent].every(x => x !== null && String(x) !== '' && Number(x) >= 0) && Number(v.gst_percent) <= 100 && Number(v.discount_percent) <= 100),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap(v => this.inventory.calculatePricing({
        purchase_price: Number(v.purchase_price),
        margin_percent: Number(v.margin_percent),
        discount_percent: Number(v.discount_percent),
        gst_percent: Number(v.gst_percent),
      }).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((res: any) => {
      if (res?.success) {
        this.pricing.set({
          sellingPrice: res.data.selling_price,
          discountAmount: res.data.discount_amount,
          gstAmount: res.data.gst_amount,
          totalAmount: res.data.total_amount,
        });
      }
    });
  }

  saveProduct(): void {
    if (this.isSaving()) return;

    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    const raw = this.productForm.getRawValue();
    const payload: ProductPayload = {
      name: (raw.name ?? '').trim(),
      description: (raw.description ?? '').trim(),
      vendor_id: Number(raw.vendorId),
      purchase_price: Number(raw.purchasePrice),
      margin_percent: Number(raw.marginPercent),
      discount_percent: Number(raw.discountPercent),
      gst_percent: Number(raw.gstPercent),
      status: raw.status ?? 'Active',
    };

    this.isSaving.set(true);
    const request$ = this.data.product
      ? this.inventory.updateProduct(this.data.product.id, payload)
      : this.inventory.createProduct(payload);

    request$.subscribe({
      next: (res: any) => {
        this.isSaving.set(false);
        if (res?.success === false) {
          this.toast.error(res?.message || 'Failed to save product. Please try again.');
          return;
        }
        this.toast.success(this.isEdit ? 'Product updated successfully' : 'Product created successfully');
        this.dialogRef.close(res?.data ?? true);
      },
      error: (err: any) => {
        this.isSaving.set(false);
        const errors = err?.error?.errors as Record<string, string[]> | undefined;
        const firstError = errors ? Object.values(errors)[0]?.[0] : undefined;
        this.toast.error(firstError || err?.error?.message || 'Failed to save product. Please try again.');
        console.error('Failed to save product:', err);
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: 'name' | 'description' | 'vendorId' | 'purchasePrice' | 'marginPercent' | 'discountPercent' | 'gstPercent'): boolean {
    const control = this.productForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }
}
