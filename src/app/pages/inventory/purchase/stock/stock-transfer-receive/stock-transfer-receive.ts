import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { StockTransferLine, displayDate, statusTone } from '../../../../../shared/models/purchase.model';

interface ReceiveRow extends StockTransferLine {
  accept: number | null;
  reject: number | null;
  reason: string;
}

/**
 * Reference "Accept/Reject Transfer": the receiving store enters accepted and rejected qty per line.
 * accepted + rejected <= in transit; rejected qty needs a reason (and goes back to the source); whatever is left
 * stays in transit and can be received later. Opens read-only ("View Transfer") when the user cannot receive.
 */
@Component({
  selector: 'app-stock-transfer-receive',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './stock-transfer-receive.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', '../../goods-inward/goods-inward-form/goods-inward-form.scss'],
})
export class StockTransferReceive {
  private readonly dialogRef = inject(MatDialogRef<StockTransferReceive>);
  private readonly data = inject<{ transferId: string }>(MAT_DIALOG_DATA);
  readonly purchase = inject(PurchaseService);
  readonly displayDate = displayDate;
  readonly statusTone = statusTone;

  readonly transfer = computed(() => this.purchase.transfers().find(t => t.id === this.data.transferId)!);
  readonly editable = computed(() => this.transfer().canReceive);
  readonly reasons = computed(() => this.purchase.meta().transferRejectReasons);
  readonly rows = signal<ReceiveRow[]>(this.transfer().lines.map(l => ({ ...l, accept: l.pendingQty || null, reject: null, reason: '' })));
  readonly submitted = signal(false);
  readonly saving = signal(false);
  remarks = '';

  touch(row?: ReceiveRow): void {
    // "Reason not required for rejected qty zero products": clear it when nothing is rejected.
    if (row && !(Number(row.reject) > 0)) row.reason = '';
    this.rows.update(list => [...list]);
  }

  acceptAll(): void {
    this.rows.update(list => list.map(r => ({ ...r, accept: r.pendingQty, reject: null, reason: '' })));
  }

  leftInTransit(row: ReceiveRow): number {
    return Math.max(0, row.pendingQty - (Number(row.accept) || 0) - (Number(row.reject) || 0));
  }

  rowError(row: ReceiveRow): string | null {
    const a = Number(row.accept) || 0;
    const r = Number(row.reject) || 0;
    if (a < 0 || r < 0) return 'Accepted quantity cannot be less than 0.';
    if (!Number.isInteger(a) || !Number.isInteger(r)) return 'Qty must be a whole number.';
    if (a + r > row.pendingQty) return `Accepted + rejected cannot be more than the ${row.pendingQty} in transit.`;
    if (r > 0 && !row.reason) return 'Reason required for rejected qty.';
    return null;
  }

  readonly summary = computed(() => {
    const list = this.rows();
    return {
      accept: list.reduce((s, r) => s + (Number(r.accept) || 0), 0),
      reject: list.reduce((s, r) => s + (Number(r.reject) || 0), 0),
      left: list.reduce((s, r) => s + this.leftInTransit(r), 0),
    };
  });

  async save(): Promise<void> {
    this.submitted.set(true);
    if (this.rows().some(r => this.rowError(r)) || this.saving()) return;
    const { accept, reject } = this.summary();
    if (!accept && !reject) return;

    this.saving.set(true);
    const result = await this.purchase.receiveTransfer(this.transfer().id, this.rows()
      .filter(r => (Number(r.accept) || 0) + (Number(r.reject) || 0) > 0)
      .map(r => ({ lineId: r.id, acceptedQty: Number(r.accept) || 0, rejectedQty: Number(r.reject) || 0, rejectReason: r.reason || null })), this.remarks.trim());
    this.saving.set(false);
    if (result) this.dialogRef.close(result);
  }

  printPdf(): void {
    void this.purchase.openPdf('stock-transfer', this.transfer().id);
  }

  close(): void {
    this.dialogRef.close();
  }
}
