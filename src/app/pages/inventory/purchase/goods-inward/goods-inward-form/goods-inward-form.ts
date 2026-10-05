import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE, InwardLine, PurchaseLineItem, VendorNoteType } from '../../../../../shared/models/purchase.model';

interface EditableLine extends InwardLine {
  /** First row of a product shows ordered/previous/pending; extra rows are additional batches. */
  isExtraBatch: boolean;
}

/** Receive goods against a PO - one or more batches per product, partial or full, with optional credit/debit note. */
@Component({
  selector: 'app-goods-inward-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './goods-inward-form.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', './goods-inward-form.scss'],
})
export class GoodsInwardForm {
  private readonly dialogRef = inject(MatDialogRef<GoodsInwardForm>);
  private readonly data = inject<{ orderId: string }>(MAT_DIALOG_DATA);
  readonly purchase = inject(PurchaseService);

  readonly order = computed(() => this.purchase.orders().find(o => o.id === this.data.orderId)!);
  readonly lines = signal<EditableLine[]>(this.initialLines());
  readonly submitted = signal(false);
  readonly noteTypes: VendorNoteType[] = ['Debit Note', 'Credit Note'];

  store = CENTRAL_STORE;

  /** Units of the product currently in hand at the central store. */
  centralQty(productId: string): number {
    return this.purchase.storeQty(CENTRAL_STORE, productId);
  }

  vendorInvoiceNo = '';
  raiseNote = false;
  noteType: VendorNoteType = 'Debit Note';
  noteReason = '';

  private initialLines(): EditableLine[] {
    const order = this.purchase.orders().find(o => o.id === this.data.orderId);
    const taken: string[] = [];
    return (order?.items ?? [])
      .filter(i => i.receivedQty < i.requestedQty)
      .map(i => {
        const line = this.lineFor(i, i.requestedQty - i.receivedQty, false, taken);
        taken.push(line.batchNo);
        return line;
      });
  }

  /** Batch no comes from the PO (generated on approval); split rows / later GRNs get the next suffix. */
  private lineFor(item: PurchaseLineItem, qty: number, isExtraBatch: boolean, taken: string[]): EditableLine {
    return {
      productId: item.productId,
      productName: item.productName,
      batchNo: this.purchase.nextInwardBatchNo(this.data.orderId, item.productId, taken),
      mfgDate: null,
      expiryDate: null,
      orderedQty: item.requestedQty,
      previousQty: item.receivedQty,
      receivedQty: qty,
      damagedQty: 0,
      unitPrice: item.unitPrice,
      isExtraBatch,
    };
  }

  pendingQty(line: InwardLine): number {
    return line.orderedQty - line.previousQty;
  }

  /** Accepted qty across every batch row of the product. */
  acceptedFor(productId: string): number {
    return this.lines().filter(l => l.productId === productId).reduce((s, l) => s + Math.max(0, (l.receivedQty || 0) - (l.damagedQty || 0)), 0);
  }

  balanceFor(line: InwardLine): number {
    return Math.max(0, this.pendingQty(line) - this.acceptedFor(line.productId));
  }

  receivedFor(productId: string): number {
    return this.lines().filter(l => l.productId === productId).reduce((s, l) => s + (l.receivedQty || 0), 0);
  }

  /** Accepted (received - damaged) may not exceed what is still pending on the PO. */
  isOver(line: InwardLine): boolean {
    return this.acceptedFor(line.productId) > this.pendingQty(line);
  }

  isDuplicateBatch(line: InwardLine): boolean {
    const batch = (line.batchNo || '').trim().toUpperCase();
    return !!batch && this.lines().filter(l => l.productId === line.productId && (l.batchNo || '').trim().toUpperCase() === batch).length > 1;
  }

  readonly summary = computed(() => {
    const lines = this.lines();
    const firsts = lines.filter(l => !l.isExtraBatch);
    const received = lines.reduce((s, l) => s + (l.receivedQty || 0), 0);
    const damaged = lines.reduce((s, l) => s + (l.damagedQty || 0), 0);
    const short = firsts.reduce((s, l) => s + this.balanceFor(l), 0);
    return { received, damaged, short, partial: short > 0 };
  });

  addBatch(line: EditableLine): void {
    const item = this.order().items.find(i => i.productId === line.productId)!;
    const list = [...this.lines()];
    const lastIndex = list.map(l => l.productId).lastIndexOf(line.productId);
    list.splice(lastIndex + 1, 0, this.lineFor(item, this.balanceFor(line), true, list.map(l => l.batchNo)));
    this.lines.set(list);
  }

  removeBatch(index: number): void {
    this.lines.update(list => list.filter((_, i) => i !== index));
  }

  touch(): void {
    this.lines.update(list => [...list]);
    const { damaged, short } = this.summary();
    if ((damaged || short) && !this.raiseNote) this.raiseNote = true;
  }

  lineError(line: InwardLine): string | null {
    if (line.receivedQty < 0 || line.damagedQty < 0) return 'Qty cannot be negative.';
    if (!Number.isInteger(Number(line.receivedQty || 0)) || !Number.isInteger(Number(line.damagedQty || 0))) return 'Qty must be a whole number.';
    if (line.damagedQty > line.receivedQty) return 'Damaged exceeds received.';
    if (this.isOver(line)) return 'More than pending qty.';
    if (line.receivedQty > 0 && !line.batchNo.trim()) return 'Batch no is required.';
    if (this.isDuplicateBatch(line)) return 'Same batch no already added for this product.';
    if (line.expiryDate && line.mfgDate && line.expiryDate <= line.mfgDate) return 'Expiry must be after MFG.';
    return null;
  }

  get formInvalid(): boolean {
    return !this.vendorInvoiceNo.trim()
      || !this.summary().received
      || this.lines().some(l => this.lineError(l))
      || (this.raiseNote && !this.noteReason.trim());
  }

  save(): void {
    this.submitted.set(true);
    if (this.formInvalid) return;

    const inward = this.purchase.recordInward({
      poId: this.order().id,
      store: this.store,
      vendorInvoiceNo: this.vendorInvoiceNo.trim(),
      lines: this.lines()
        .filter(l => l.receivedQty > 0)
        .map(({ isExtraBatch, ...l }) => ({ ...l, batchNo: l.batchNo.trim().toUpperCase() })),
      note: this.raiseNote ? { type: this.noteType, reason: this.noteReason.trim() } : null,
    });
    if (inward) this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
