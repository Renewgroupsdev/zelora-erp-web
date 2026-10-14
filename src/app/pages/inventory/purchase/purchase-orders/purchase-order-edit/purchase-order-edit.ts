import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { inr, lineTotals } from '../../../../../shared/models/purchase.model';

/**
 * Edit PO (reference "Edit PO"): the expected delivery date while the order is open; line quantities only
 * while nothing has been received (the server enforces both).
 */
@Component({
  selector: 'app-purchase-order-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './purchase-order-edit.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', '../../goods-inward/goods-inward-form/goods-inward-form.scss'],
})
export class PurchaseOrderEdit {
  private readonly dialogRef = inject(MatDialogRef<PurchaseOrderEdit>);
  private readonly data = inject<{ orderId: string }>(MAT_DIALOG_DATA);
  readonly purchase = inject(PurchaseService);
  readonly inr = inr;

  readonly order = computed(() => this.purchase.orders().find(o => o.id === this.data.orderId)!);
  readonly today = new Date().toISOString().slice(0, 10);
  readonly saving = signal(false);
  readonly submitted = signal(false);

  expectedAt: string | null = this.order().expectedAt;
  /** Editable copy of the line quantities. */
  readonly qty = signal<Record<string, number>>(Object.fromEntries(this.order().items.map(i => [i.id!, i.requestedQty])));

  setQty(id: string, value: number): void {
    this.qty.update(q => ({ ...q, [id]: value }));
  }

  qtyError(id: string): string | null {
    const v = Number(this.qty()[id]);
    if (!Number.isInteger(v) || v < 1) return 'Qty must be a whole number of at least 1.';
    return null;
  }

  readonly totals = computed(() => lineTotals(this.order().items.map(i => ({ ...i, requestedQty: Number(this.qty()[i.id!]) || 0 }))));

  async save(): Promise<void> {
    this.submitted.set(true);
    const o = this.order();
    if (o.canEditQty && o.items.some(i => this.qtyError(i.id!))) return;
    if (this.expectedAt && this.expectedAt < this.today) return;

    const changedItems = o.canEditQty
      ? o.items.filter(i => Number(this.qty()[i.id!]) !== i.requestedQty).map(i => ({ id: i.id!, qty: Number(this.qty()[i.id!]) }))
      : [];
    const dateChanged = (this.expectedAt || null) !== (o.expectedAt || null);
    if (!changedItems.length && !dateChanged) {
      this.dialogRef.close();
      return;
    }

    this.saving.set(true);
    const ok = await this.purchase.updateOrder(o.id, { ...(dateChanged ? { expectedAt: this.expectedAt } : {}), items: changedItems });
    this.saving.set(false);
    if (ok) this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
