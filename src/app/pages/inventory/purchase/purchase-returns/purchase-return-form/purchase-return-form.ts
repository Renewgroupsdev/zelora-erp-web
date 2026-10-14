import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService, ReturnableLine } from '../../../../../shared/common-services/purchase.service';
import { GoodsInward, PURCHASE_RETURN_REASONS, PurchaseReturnReason, PurchaseReturnType, displayDate, inr } from '../../../../../shared/models/purchase.model';

interface ReturnRow extends ReturnableLine {
  qty: number | null;
}

/** Pick a purchase inward (GRN), enter the qty to send back per batch, and post the return. */
@Component({
  selector: 'app-purchase-return-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './purchase-return-form.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', './purchase-return-form.scss'],
})
export class PurchaseReturnForm {
  private readonly dialogRef = inject(MatDialogRef<PurchaseReturnForm>);
  private readonly data = inject<{ grnId?: string } | null>(MAT_DIALOG_DATA, { optional: true });
  readonly purchase = inject(PurchaseService);
  readonly reasons = computed(() => (this.purchase.meta().returnReasons.length ? this.purchase.meta().returnReasons : [...PURCHASE_RETURN_REASONS]));
  readonly returnTypes = computed(() => this.purchase.meta().returnTypes);
  readonly displayDate = displayDate;
  readonly inr = inr;

  /** GRNs with something left to return (from the server). */
  readonly inwards = signal<GoodsInward[]>([]);
  readonly grnId = signal<string | null>(this.data?.grnId ?? null);
  readonly inward = computed(() => this.inwards().find(g => g.id === this.grnId()) ?? null);
  readonly rows = signal<ReturnRow[]>([]);
  readonly loadingRows = signal(false);
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  reason: PurchaseReturnReason | '' = '';
  /** Debit Note: vendor owes the value. Replacement: the qty re-opens on the PO for the vendor to resend. */
  returnType: PurchaseReturnType = 'Debit Note';
  remarks = '';
  raiseNote = true;

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    this.inwards.set(await this.purchase.returnableInwards());
    if (!this.grnId() && this.inwards().length) this.grnId.set(this.inwards()[0].id);
    await this.loadRows();
  }

  selectGrn(id: string | null): void {
    this.grnId.set(id);
    this.submitted.set(false);
    this.error.set(null);
    void this.loadRows();
  }

  private async loadRows(): Promise<void> {
    const id = this.grnId();
    if (!id) {
      this.rows.set([]);
      return;
    }
    this.loadingRows.set(true);
    const lines = await this.purchase.returnableLines(id);
    this.loadingRows.set(false);
    if (this.grnId() === id) this.rows.set(lines.map(l => ({ ...l, qty: null })));
  }

  /** Re-emit so the summary recomputes after a qty edit. */
  touch(): void {
    this.rows.update(list => [...list]);
  }

  returnAll(row: ReturnRow): void {
    row.qty = row.returnable;
    this.touch();
  }

  rowError(row: ReturnRow): string | null {
    const q = Number(row.qty) || 0;
    if (!row.qty) return null;
    if (!Number.isInteger(q) || q < 0) return 'Qty must be a whole number.';
    if (q > row.returnable) return `Only ${row.returnable} can be returned from this batch.`;
    return null;
  }

  readonly summary = computed(() => {
    const list = this.rows();
    const qty = list.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const value = list.reduce((s, r) => s + (Number(r.qty) || 0) * r.unitPrice, 0);
    return { qty, value };
  });

  async save(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    const inward = this.inward();
    if (!inward || !this.reason || this.saving()) return;
    if (this.rows().some(r => this.rowError(r))) return;
    if (!this.summary().qty) {
      this.error.set('Enter a return qty for at least one batch.');
      return;
    }

    this.saving.set(true);
    const result = await this.purchase.recordReturn({
      grnId: inward.id,
      reason: this.reason,
      returnType: this.returnType,
      remarks: this.remarks.trim(),
      raiseNote: this.raiseNote,
      lines: this.rows().filter(r => Number(r.qty) > 0).map(r => ({ productId: r.productId, batchNo: r.batchNo, qty: Number(r.qty) })),
    });
    this.saving.set(false);
    if (result) this.dialogRef.close(result);
  }

  close(): void {
    this.dialogRef.close();
  }
}
