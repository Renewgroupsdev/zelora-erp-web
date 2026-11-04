import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BranchOptionsService } from '../../../../../shared/common-services/branch-options.service';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { PurchaseOption, lineTotals } from '../../../../../shared/models/purchase.model';

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
  private readonly branchOptions = inject(BranchOptionsService);
  /** Requesting branch options (GET /branches/options). */
  readonly branches = this.branchOptions.options;

  readonly products = toSignal(this.purchase.productOptions(), { initialValue: [] as PurchaseOption[] });
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly today = new Date().toISOString().slice(0, 10);

  readonly form = this.fb.group({
    branchKey: [null as string | null, Validators.required],
    /** PO date: the date the branch wants the purchase order raised for. */
    requiredBy: [null as string | null],
    remarks: ['', Validators.maxLength(255)],
    items: this.fb.array([this.newItem()]),
  });

  constructor() {
    this.branchOptions.ensure();
    // Default to the user's own branch (else the first branch) once the branch list has loaded.
    effect(() => {
      const branches = this.branches();
      const control = this.form.controls.branchKey;
      if (control.value !== null || !branches.length) return;
      const mine = branches.find(b => b.key === this.purchase.meta().userStoreKey);
      control.setValue((mine ?? branches[0]).key);
    });
  }

  get items(): FormArray {
    return this.form.controls.items;
  }

  private newItem() {
    return this.fb.group({
      productId: [null as string | null, Validators.required],
      qty: [1, [Validators.required, Validators.min(1)]],
    });
  }

  product(index: number): PurchaseOption | undefined {
    const id = this.items.at(index).get('productId')?.value;
    return this.products().find(p => p.id === id);
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

  async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) return;

    const raw = this.form.getRawValue();
    this.saving.set(true);
    const request = await this.purchase.createRequest({
      branchKey: String(raw.branchKey),
      requiredBy: raw.requiredBy,
      remarks: (raw.remarks ?? '').trim(),
      // Price + GST are taken from the product master on the server.
      items: raw.items.map((row: { productId: string | null; qty: number | null }) => ({ productId: String(row.productId), qty: Number(row.qty) })),
    });
    this.saving.set(false);
    if (request) this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
