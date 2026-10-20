import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE_KEY, StockBatch, displayDate } from '../../../../../shared/models/purchase.model';

interface TransferRow {
  batchId: string | null;
  qty: number | null;
}

/**
 * Dispatch stock to another store (reference stock transfer / stock return): one or more batches leave the source
 * now and stay "In Transit" until the receiving store accepts or rejects them.
 */
@Component({
  selector: 'app-stock-transfer-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './stock-transfer-form.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', '../../goods-inward/goods-inward-form/goods-inward-form.scss'],
})
export class StockTransferForm {
  private readonly dialogRef = inject(MatDialogRef<StockTransferForm>);
  private readonly data = inject<{ batchId?: string } | null>(MAT_DIALOG_DATA, { optional: true });
  readonly purchase = inject(PurchaseService);
  readonly displayDate = displayDate;

  private readonly startBatch = this.purchase.stock().find(b => b.id === this.data?.batchId) ?? null;
  readonly fromStoreKey = signal<string>(this.startBatch?.storeKey ?? CENTRAL_STORE_KEY);
  readonly rows = signal<TransferRow[]>([{ batchId: this.startBatch?.id ?? null, qty: null }]);
  readonly submitted = signal(false);
  readonly saving = signal(false);
  remarks = '';

  /** Earliest expiry first, so the batch that should go out first is on top. */
  readonly batches = computed(() => this.purchase.availableBatches(this.fromStoreKey()));
  readonly targets = computed(() => this.purchase.storeOptions().filter(s => s.key !== this.fromStoreKey()));
  toStoreKey: string = this.defaultTarget();

  readonly kind = computed(() => (this.toStoreKeySignal() === CENTRAL_STORE_KEY ? 'Stock Return to Central Store' : 'Stock Transfer'));
  private readonly toStoreKeySignal = signal<string>(this.toStoreKey);

  private defaultTarget(): string {
    const others = this.purchase.storeOptions().filter(s => s.key !== this.fromStoreKey());
    return others[0]?.key ?? CENTRAL_STORE_KEY;
  }

  setFrom(storeKey: string): void {
    this.fromStoreKey.set(storeKey);
    this.rows.set([{ batchId: null, qty: null }]);
    if (this.toStoreKey === storeKey) this.setTo(this.defaultTarget());
  }

  setTo(storeKey: string): void {
    this.toStoreKey = storeKey;
    this.toStoreKeySignal.set(storeKey);
  }

  batch(row: TransferRow): StockBatch | null {
    return this.batches().find(b => b.id === row.batchId) ?? null;
  }

  /** Batches not already picked on another row ("Product with same batchno already available in the list"). */
  options(index: number): StockBatch[] {
    const taken = new Set(this.rows().filter((_, i) => i !== index).map(r => r.batchId));
    return this.batches().filter(b => !taken.has(b.id));
  }

  touch(): void {
    this.rows.update(list => [...list]);
  }

  rowError(row: TransferRow): string | null {
    const b = this.batch(row);
    if (!b) return 'Select batch no.';
    const q = Number(row.qty);
    if (!row.qty || q <= 0) return 'Transfer qty required.';
    if (!Number.isInteger(q)) return 'Qty must be a whole number.';
    if (q > b.qty) return `Transfer qty should not be greater than the ${b.qty} available.`;
    return null;
  }

  readonly totalQty = computed(() => this.rows().reduce((s, r) => s + (Number(r.qty) || 0), 0));

  /** Source store total for a product after this transfer (all rows of that product). */
  sourceAfter(row: TransferRow): number {
    const b = this.batch(row);
    if (!b) return 0;
    const out = this.rows().filter(r => this.batch(r)?.productId === b.productId).reduce((s, r) => s + (Number(r.qty) || 0), 0);
    return this.purchase.storeQtyByKey(this.fromStoreKey(), b.productId) - out;
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    if (this.toStoreKey === this.fromStoreKey() || this.rows().some(r => this.rowError(r)) || this.saving()) return;

    this.saving.set(true);
    const transfer = await this.purchase.dispatchTransfer({
      fromStoreKey: this.fromStoreKey(),
      toStoreKey: this.toStoreKey,
      remarks: this.remarks.trim(),
      lines: this.rows().map(r => ({ batchId: r.batchId!, qty: Number(r.qty) })),
    });
    this.saving.set(false);
    if (transfer) this.dialogRef.close(transfer);
  }

  close(): void {
    this.dialogRef.close();
  }
}
