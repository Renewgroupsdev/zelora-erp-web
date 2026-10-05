import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE, PurchaseOption, Priority, lineTotals } from '../../../../../shared/models/purchase.model';

@Component({
  selector: 'app-purchase-request-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './purchase-request-form.html',
  styleUrl: '../../../../../shared/styles/erp-dialog.scss',
})
export class PurchaseRequestForm {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<PurchaseRequestForm>);
  readonly purchase = inject(PurchaseService);

  readonly vendors = toSignal(this.purchase.vendorOptions(), { initialValue: [] });
  readonly products = toSignal(this.purchase.productOptions(), { initialValue: [] as PurchaseOption[] });
  readonly submitted = signal(false);
  readonly priorities: Priority[] = ['Low', 'Normal', 'Urgent'];
  readonly today = new Date().toISOString().slice(0, 10);

  readonly form = this.fb.group({
    branch: [this.purchase.branches[0], Validators.required],
    vendorId: [null as number | null, Validators.required],
    requiredBy: [null as string | null],
    priority: ['Normal' as Priority],
    remarks: ['', Validators.maxLength(255)],
    items: this.fb.array([this.newItem()]),
  });

  get items(): FormArray {
    return this.form.controls.items;
  }

  private newItem() {
    return this.fb.group({
      productId: [null as string | null, Validators.required],
      qty: [1, [Validators.required, Validators.min(1)]],
    });
  }

  /** Products supplied by the chosen vendor (all products until one is picked). */
  vendorProducts(): PurchaseOption[] {
    const vendorId = this.form.controls.vendorId.value;
    const list = this.products();
    return vendorId ? list.filter(p => p.vendorId === vendorId) : list;
  }

  product(index: number): PurchaseOption | undefined {
    const id = this.items.at(index).get('productId')?.value;
    return this.products().find(p => p.id === id);
  }

  centralQty(index: number): number {
    const p = this.product(index);
    return p ? this.purchase.storeQty(CENTRAL_STORE, p.id) : 0;
  }

  lineAmount(index: number): number {
    const p = this.product(index);
    const qty = Number(this.items.at(index).get('qty')?.value) || 0;
    return p ? p.unitPrice * qty * (1 + p.gstPercent / 100) : 0;
  }

  totals() {
    return lineTotals(this.items.controls.map((_, i) => ({
      unitPrice: this.product(i)?.unitPrice ?? 0,
      gstPercent: this.product(i)?.gstPercent ?? 0,
      requestedQty: Number(this.items.at(i).get('qty')?.value) || 0,
    })));
  }

  onVendorChange(): void {
    // Drop products that the newly selected vendor doesn't supply.
    const allowed = new Set(this.vendorProducts().map(p => p.id));
    this.items.controls.forEach(c => {
      if (c.value.productId && !allowed.has(c.value.productId)) c.patchValue({ productId: null });
    });
  }

  addItem(): void {
    this.items.push(this.newItem());
  }

  removeItem(index: number): void {
    if (this.items.length > 1) this.items.removeAt(index);
  }

  isTaken(productId: string, index: number): boolean {
    return this.items.controls.some((c, i) => i !== index && c.value.productId === productId);
  }

  invalid(path: string): boolean {
    const c = this.form.get(path);
    return !!c && c.invalid && (c.touched || this.submitted());
  }

  submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const vendor = this.vendors().find(v => v.id === raw.vendorId);
    this.purchase.createRequest({
      branch: raw.branch ?? '',
      vendorId: raw.vendorId,
      vendorName: vendor?.name ?? '-',
      requiredBy: raw.requiredBy,
      priority: raw.priority ?? 'Normal',
      remarks: (raw.remarks ?? '').trim(),
      items: raw.items.map((row: { productId: string | null; qty: number | null }) => {
        const p = this.products().find(x => x.id === row.productId)!;
        return { productId: p.id, productCode: p.code, productName: p.name, unitPrice: p.unitPrice, gstPercent: p.gstPercent, requestedQty: Number(row.qty) };
      }),
    });
    this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
