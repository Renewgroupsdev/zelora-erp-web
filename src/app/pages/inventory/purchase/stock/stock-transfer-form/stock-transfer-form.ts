import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { StockBatch, displayDate } from '../../../../../shared/models/purchase.model';

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
  readonly fromStoreId = signal<number | null>(this.startBatch?.storeId ?? null);
  readonly rows = signal<TransferRow[]>([{ batchId: this.startBatch?.id ?? null, qty: null }]);
  readonly submitted = signal(false);
  readonly saving = signal(false);
  remarks = '';

  /** Earliest expiry first, so the batch that should go out first is on top. */
  readonly batches = computed(() => this.purchase.availableBatches(this.fromStoreId()));
  readonly targets = computed(() => this.purchase.storeOptions().filter(s => s.id !== this.fromStoreId()));
  toStoreId: number | null = this.defaultTarget();

  readonly kind = computed(() => (this.toStoreIdSignal() === null ? 'Stock Return to Central Store' : 'Stock Transfer'));
  private readonly toStoreIdSignal = signal<number | null>(this.toStoreId);

  private defaultTarget(): number | null {
    const others = this.purchase.storeOptions().filter(s => s.id !== this.fromStoreId());
    return others[0]?.id ?? null;
  }

  setFrom(storeId: number | null): void {
    this.fromStoreId.set(storeId);
    this.rows.set([{ batchId: null, qty: null }]);
    if (this.toStoreId === storeId) this.setTo(this.defaultTarget());
  }

  setTo(storeId: number | null): void {
    this.toStoreId = storeId;
    this.toStoreIdSignal.set(storeId);
  }

  batch(row: TransferRow): StockBatch | null {
    return this.batches().find(b => b.id === row.batchId) ?? null;
  }

  /** Batches not already picked on another row ("Product with same batchno already available in the list"). */
  options(index: number): StockBatch[] {
    const taken = new Set(this.rows().filter((_, i) => i !== index).map(r => r.batchId));
    return this.batches().filter(b => !taken.has(b.id));
  }

  addRow(): void {
    this.rows.update(list => [...list, { batchId: null, qty: null }]);
  }

  removeRow(index: number): void {
    this.rows.update(list => (list.length > 1 ? list.filter((_, i) => i !== index) : list));
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
    return this.purchase.storeQtyById(this.fromStoreId(), b.productId) - out;
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    if (this.toStoreId === this.fromStoreId() || this.rows().some(r => this.rowError(r)) || this.saving()) return;

    this.saving.set(true);
    const transfer = await this.purchase.dispatchTransfer({
      fromStoreId: this.fromStoreId(),
      toStoreId: this.toStoreId,
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
