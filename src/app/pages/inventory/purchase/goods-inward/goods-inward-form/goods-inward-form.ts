import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE_KEY, InwardLine, VendorNoteType, inr } from '../../../../../shared/models/purchase.model';
import { PageLoader } from '../../../../../shared/components/page-loader/page-loader';

interface EditableLine extends InwardLine {
  /** Units still pending on the PO for this product. */
  pendingQty: number;
}

/**
 * Receive goods against a PO (reference "Add PO Inward Entries"): one batch per product, partial or full,
 * with the vendor bill - rate, discount %, free qty, selling price per line; freight, other charges, cash discount
 * and round off on the bill. The server repeats every check and computes the same totals.
 */
@Component({
  selector: 'app-goods-inward-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, PageLoader],
  templateUrl: './goods-inward-form.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', './goods-inward-form.scss'],
})
export class GoodsInwardForm {
  private readonly dialogRef = inject(MatDialogRef<GoodsInwardForm>);
  private readonly data = inject<{ orderId: string }>(MAT_DIALOG_DATA);
  readonly purchase = inject(PurchaseService);
  readonly inr = inr;

  readonly order = computed(() => this.purchase.orders().find(o => o.id === this.data.orderId)!);
  readonly lines = signal<EditableLine[]>([]);
  readonly loadingLines = signal(true);
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly noteTypes: VendorNoteType[] = ['Debit Note', 'Credit Note'];
  readonly today = new Date().toISOString().slice(0, 10);

  /** Store key: "central" | "branch:9" | "franchise:7". */
  storeKey: string = CENTRAL_STORE_KEY;
  vendorInvoiceNo = '';
  billDate: string | null = this.today;
  freight: number | null = null;
  otherCharges: number | null = null;
  cashDiscount: number | null = null;
  roundOff: number | null = null;
  remarks = '';
  raiseNote = false;
  noteType: VendorNoteType = 'Debit Note';
  noteReason = '';

  constructor() {
    // Store qty shown per line; stock is not part of the Purchase Inward tab load.
    void this.purchase.reload('stock');
    void this.loadLines();
  }

  /** Pending lines with the batch number the server generated for this PO. */
  private async loadLines(): Promise<void> {
    const rows = await this.purchase.inwardDefaults(this.data.orderId);
    this.loadingLines.set(false);
    if (!rows) {
      this.dialogRef.close();
      return;
    }
    this.lines.set(rows.map(l => ({ ...l, pendingQty: l.orderedQty - l.previousQty - this.closedQty(l.productId) })));
  }

  private closedQty(productId: string): number {
    return this.order().items.find(i => i.productId === productId)?.closedQty ?? 0;
  }

  centralQty(productId: string): number {
    return this.purchase.storeQtyByKey(CENTRAL_STORE_KEY, productId);
  }

  /** Accepted qty (received - damaged) across every batch row of the product. */
  acceptedFor(productId: string): number {
    return this.lines().filter(l => l.productId === productId).reduce((s, l) => s + Math.max(0, (Number(l.receivedQty) || 0) - (Number(l.damagedQty) || 0)), 0);
  }

  pendingFor(productId: string): number {
    return this.lines().find(l => l.productId === productId)?.pendingQty ?? 0;
  }

  balanceFor(line: EditableLine): number {
    return Math.max(0, line.pendingQty - this.acceptedFor(line.productId));
  }

  /** "Received qty cannot be greater than Pending qty". */
  isOver(line: InwardLine): boolean {
    return this.acceptedFor(line.productId) > this.pendingFor(line.productId);
  }

  isDuplicateBatch(line: InwardLine): boolean {
    const batch = (line.batchNo || '').trim().toUpperCase();
    return !!batch && this.lines().filter(l => l.productId === line.productId && (l.batchNo || '').trim().toUpperCase() === batch).length > 1;
  }

  /** Rate per unit after the vendor discount (before GST) - what the selling price starts from. */
  netRate(line: Pick<InwardLine, 'unitPrice' | 'discountPercent'>): number | null {
    const rate = Number(line.unitPrice) || 0;
    if (rate <= 0) return null;
    const disc = Math.min(Math.max(Number(line.discountPercent) || 0, 0), 99.99);
    return round2(rate * (1 - disc / 100));
  }

  /** received x rate x (1 - disc%) x (1 + GST%) - same formula as the server. */
  lineTotal(line: InwardLine): number {
    const qty = Number(line.receivedQty) || 0;
    const rate = Number(line.unitPrice) || 0;
    const disc = Number(line.discountPercent) || 0;
    return round2(qty * rate * (1 - disc / 100) * (1 + (line.gstPercent || 0) / 100));
  }

  readonly summary = computed(() => {
    const lines = this.lines();
    const received = lines.reduce((s, l) => s + (Number(l.receivedQty) || 0), 0);
    const damaged = lines.reduce((s, l) => s + (Number(l.damagedQty) || 0), 0);
    const free = lines.reduce((s, l) => s + (Number(l.freeQty) || 0), 0);
    const short = lines.reduce((s, l) => s + this.balanceFor(l), 0);
    const items = round2(lines.reduce((s, l) => s + this.lineTotal(l), 0));
    return { received, damaged, free, short, partial: short > 0, items };
  });

  /** Items + freight + other + round off - cash discount (reference calculateEntrySummary). */
  netAmount(): number {
    return round2(this.summary().items + (Number(this.freight) || 0) + (Number(this.otherCharges) || 0) + (Number(this.roundOff) || 0) - (Number(this.cashDiscount) || 0));
  }

  touch(): void {
    this.lines.update(list => [...list]);
    const { damaged, short } = this.summary();
    if ((damaged || short) && !this.raiseNote) this.raiseNote = true;
  }

  lineError(line: InwardLine): string | null {
    const whole = (v: unknown) => Number.isInteger(Number(v || 0)) && Number(v || 0) >= 0;
    if (!whole(line.receivedQty) || !whole(line.damagedQty) || !whole(line.freeQty)) return 'Qty must be a whole number (0 or more).';
    if (Number(line.damagedQty) > Number(line.receivedQty)) return 'Damaged exceeds received.';
    if (this.isOver(line)) return 'Received qty cannot be greater than pending qty.';
    if (Number(line.receivedQty) > 0 && !(Number(line.unitPrice) > 0)) return 'Purchase price is required.';
    const disc = Number(line.discountPercent) || 0;
    if (disc < 0 || disc >= 100) return 'Discount must be between 0 and 100%.';
    const net = this.netRate(line);
    if (net !== null && line.sellingPrice !== null && line.sellingPrice !== undefined && String(line.sellingPrice) !== '' && Number(line.sellingPrice) < net) {
      return 'Selling price cannot be below the purchase rate after discount.';
    }
    if (this.isDuplicateBatch(line)) return 'Same batch no already added for this product.';
    if (line.expiryDate && line.mfgDate && line.expiryDate <= line.mfgDate) return 'Expiry must be after MFG.';
    if (line.expiryDate && line.expiryDate <= this.today) return 'Expiry date must be in the future.';
    return null;
  }

  billError(): string | null {
    const limit = this.purchase.meta().roundOffLimit;
    if ([this.freight, this.otherCharges, this.cashDiscount].some(v => (Number(v) || 0) < 0)) return 'Freight, other charges and cash discount cannot be negative.';
    if (limit && Math.abs(Number(this.roundOff) || 0) > limit) return `Round off value must be between -${limit} and ${limit}.`;
    if (this.netAmount() < 0) return 'Cash discount cannot be more than the bill amount.';
    if (this.billDate && this.billDate > this.today) return 'Bill date cannot be in the future.';
    return null;
  }

  get formInvalid(): boolean {
    return !this.vendorInvoiceNo.trim()
      || !this.summary().received
      || this.lines().some(l => this.lineError(l))
      || !!this.billError()
      || (this.raiseNote && !this.noteReason.trim());
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    if (this.formInvalid || this.saving()) return;

    this.saving.set(true);
    const inward = await this.purchase.recordInward({
      poId: this.order().id,
      storeKey: this.storeKey,
      vendorInvoiceNo: this.vendorInvoiceNo.trim(),
      billDate: this.billDate,
      freight: Number(this.freight) || 0,
      otherCharges: Number(this.otherCharges) || 0,
      cashDiscount: Number(this.cashDiscount) || 0,
      roundOff: Number(this.roundOff) || 0,
      remarks: this.remarks.trim(),
      lines: this.lines()
        .filter(l => Number(l.receivedQty) > 0)
        .map(l => ({
          productId: l.productId, batchNo: (l.batchNo || '').trim().toUpperCase(), mfgDate: l.mfgDate, expiryDate: l.expiryDate,
          receivedQty: Number(l.receivedQty), damagedQty: Number(l.damagedQty) || 0, freeQty: Number(l.freeQty) || 0,
          unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) || 0,
          sellingPrice: l.sellingPrice === null || String(l.sellingPrice) === '' ? null : Number(l.sellingPrice),
        })),
      note: this.raiseNote ? { type: this.noteType, reason: this.noteReason.trim() } : null,
    });
    this.saving.set(false);
    if (inward) this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
