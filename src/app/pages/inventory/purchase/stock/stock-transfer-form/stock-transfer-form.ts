import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE, LOW_STOCK_THRESHOLD, displayDate } from '../../../../../shared/models/purchase.model';

/** Move a batch from the central store (or any store) to a branch store. */
@Component({
  selector: 'app-stock-transfer-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './stock-transfer-form.html',
  styleUrl: '../../../../../shared/styles/erp-dialog.scss',
})
export class StockTransferForm {
  private readonly dialogRef = inject(MatDialogRef<StockTransferForm>);
  private readonly data = inject<{ batchId?: string } | null>(MAT_DIALOG_DATA, { optional: true });
  readonly purchase = inject(PurchaseService);
  readonly displayDate = displayDate;
  readonly threshold = LOW_STOCK_THRESHOLD;

  readonly fromStore = signal(this.purchase.stock().find(b => b.id === this.data?.batchId)?.store ?? CENTRAL_STORE);
  readonly batchId = signal<string | null>(this.data?.batchId ?? null);
  readonly submitted = signal(false);
  qty: number | null = null;
  remarks = '';

  /** Earliest expiry first, so the batch that should go out first is on top. */
  readonly batches = computed(() => this.purchase.availableBatches(this.fromStore()));
  readonly batch = computed(() => this.batches().find(b => b.id === this.batchId()) ?? null);
  readonly targets = computed(() => this.purchase.stores.filter(s => s !== this.fromStore()));
  /** Defaults to the first store that is not the source (opening from a branch batch no longer targets itself). */
  toStore = this.targets()[0];

  setFrom(store: string): void {
    this.fromStore.set(store);
    this.batchId.set(null);
    if (this.toStore === store || !this.targets().includes(this.toStore)) this.toStore = this.targets()[0];
  }

  remaining(): number {
    return (this.batch()?.qty ?? 0) - (Number(this.qty) || 0);
  }

  sourceTotalAfter(): number {
    const b = this.batch();
    return b ? this.purchase.storeQty(b.store, b.productId) - (Number(this.qty) || 0) : 0;
  }

  targetTotalAfter(): number {
    const b = this.batch();
    return b ? this.purchase.storeQty(this.toStore, b.productId) + (Number(this.qty) || 0) : 0;
  }

  qtyError(): string | null {
    const q = Number(this.qty);
    if (!this.qty || q <= 0) return 'Enter a quantity.';
    if (!Number.isInteger(q)) return 'Qty must be a whole number.';
    if (q > (this.batch()?.qty ?? 0)) return `Only ${this.batch()?.qty ?? 0} available in this batch.`;
    return null;
  }

  save(): void {
    this.submitted.set(true);
    const b = this.batch();
    if (!b || this.qtyError() || !this.toStore || this.toStore === b.store) return;
    const transfer = this.purchase.transferStock(b.id, this.toStore, Number(this.qty), this.remarks.trim());
    if (transfer) this.dialogRef.close(transfer);
  }

  close(): void {
    this.dialogRef.close();
  }
}
