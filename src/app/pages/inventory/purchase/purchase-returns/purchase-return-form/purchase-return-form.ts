import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService, ReturnableLine } from '../../../../../shared/common-services/purchase.service';
import { PURCHASE_RETURN_REASONS, PurchaseReturnReason, displayDate, inr } from '../../../../../shared/models/purchase.model';

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
  readonly reasons = PURCHASE_RETURN_REASONS;
  readonly displayDate = displayDate;
  readonly inr = inr;

  readonly inwards = this.purchase.returnableInwards();
  readonly grnId = signal<string | null>(this.data?.grnId ?? this.inwards[0]?.id ?? null);
  readonly inward = computed(() => this.purchase.inwards().find(g => g.id === this.grnId()) ?? null);
  readonly rows = signal<ReturnRow[]>([]);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);

  reason: PurchaseReturnReason | '' = '';
  remarks = '';
  raiseNote = true;

  constructor() {
    this.loadRows();
  }

  selectGrn(id: string | null): void {
    this.grnId.set(id);
    this.submitted.set(false);
    this.error.set(null);
    this.loadRows();
  }

  private loadRows(): void {
    const id = this.grnId();
    this.rows.set(id ? this.purchase.returnableLines(id).map(l => ({ ...l, qty: null })) : []);
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

  save(): void {
    this.submitted.set(true);
    this.error.set(null);
    const inward = this.inward();
    if (!inward || !this.reason) return;
    if (this.rows().some(r => this.rowError(r))) return;
    if (!this.summary().qty) {
      this.error.set('Enter a return qty for at least one batch.');
      return;
    }

    const result = this.purchase.recordReturn({
      grnId: inward.id,
      reason: this.reason,
      remarks: this.remarks.trim(),
      raiseNote: this.raiseNote,
      lines: this.rows().filter(r => Number(r.qty) > 0).map(r => ({ productId: r.productId, batchNo: r.batchNo, qty: Number(r.qty) })),
    });
    if (result) this.dialogRef.close(result);
    else this.error.set('Could not post the return. Stock may have changed - reopen the form and try again.');
  }

  close(): void {
    this.dialogRef.close();
  }
}
