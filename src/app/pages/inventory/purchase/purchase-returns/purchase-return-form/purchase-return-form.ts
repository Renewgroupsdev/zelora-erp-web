import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService, ReturnableLine } from '../../../../../shared/common-services/purchase.service';
import { GoodsInward, PURCHASE_RETURN_REASONS, PurchaseReturnReason, PurchaseReturnType, displayDate, inr } from '../../../../../shared/models/purchase.model';
import { SearchSelect, SelectOption } from '../../../../../shared/components/search-select/search-select';

interface ReturnRow extends ReturnableLine {
  qty: number | null;
}

/** One product added to the return, with its batches from the chosen inward. */
interface ReturnGroup {
  productId: string;
  productName: string;
  batches: ReturnRow[];
  returnable: number;
  qty: number;
  value: number;
}

/**
 * Pick a purchase inward (GRN), add the products to send back (the product list holds only that inward's products),
 * enter the qty per batch, and post the return.
 */
@Component({
  selector: 'app-purchase-return-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, SearchSelect],
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
  readonly grnOptions = computed<SelectOption[]>(() => this.inwards().map(i => ({
    value: i.id, label: `${i.grnNo} · ${i.vendorName}`, hint: `${i.poNo} · ${displayDate(i.receivedAt)}`,
  })));
  /** Every batch of the chosen inward (the pool the product dropdown is built from). */
  readonly rows = signal<ReturnRow[]>([]);
  /** Products added to the return, in the order they were added. */
  readonly picked = signal<string[]>([]);
  readonly loadingRows = signal(false);
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  reason: PurchaseReturnReason | '' = '';
  /** Debit Note: vendor owes the value. Replacement: the qty re-opens on the PO for the vendor to resend. */
  returnType: PurchaseReturnType = 'Debit Note';
  remarks = '';
  raiseNote = true;
  /** Product dropdown value - cleared right after a product is added. */
  productPick: string | null = null;

  /** Only the products received on this inward that still have something to return. */
  readonly productOptions = computed<SelectOption[]>(() => {
    const map = new Map<string, { name: string; batches: number; returnable: number; price: number }>();
    for (const r of this.rows()) {
      const e = map.get(r.productId) ?? { name: r.productName, batches: 0, returnable: 0, price: r.unitPrice };
      e.batches++;
      e.returnable += r.returnable;
      map.set(r.productId, e);
    }
    return [...map.entries()].filter(([, e]) => e.returnable > 0).map(([id, e]) => ({
      value: id, label: e.name, hint: `${e.batches} batch${e.batches === 1 ? '' : 'es'} · ${e.returnable} returnable · ${inr(e.price)}`,
    }));
  });

  readonly groups = computed<ReturnGroup[]>(() => {
    const rows = this.rows();
    return this.picked().map(pid => {
      const batches = rows.filter(r => r.productId === pid);
      return {
        productId: pid,
        productName: batches[0]?.productName ?? '',
        batches,
        returnable: batches.reduce((s, r) => s + r.returnable, 0),
        qty: batches.reduce((s, r) => s + (Number(r.qty) || 0), 0),
        value: batches.reduce((s, r) => s + (Number(r.qty) || 0) * r.unitPrice, 0),
      };
    }).filter(g => g.batches.length);
  });

  readonly allAdded = computed(() => this.productOptions().length > 0 && this.productOptions().every(o => this.picked().includes(o.value as string)));

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
    this.picked.set([]);
    if (!id) {
      this.rows.set([]);
      return;
    }
    this.loadingRows.set(true);
    const lines = await this.purchase.returnableLines(id);
    this.loadingRows.set(false);
    if (this.grnId() === id) this.rows.set(lines.map(l => ({ ...l, qty: null })));
  }

  /** Adds the picked product (all its batches) to the return, then clears the dropdown for the next one. */
  addProduct(id: string | null): void {
    if (id && !this.picked().includes(id)) this.picked.update(list => [...list, id]);
    this.error.set(null);
    queueMicrotask(() => (this.productPick = null));
  }

  addAllProducts(): void {
    const ids = this.productOptions().map(o => o.value as string);
    this.picked.update(list => [...list, ...ids.filter(id => !list.includes(id))]);
    this.error.set(null);
  }

  removeProduct(id: string): void {
    this.rows().filter(r => r.productId === id).forEach(r => (r.qty = null));
    this.picked.update(list => list.filter(p => p !== id));
    this.touch();
  }

  /** Re-emit so the summary recomputes after a qty edit. */
  touch(): void {
    this.rows.update(list => [...list]);
  }

  returnAll(row: ReturnRow): void {
    row.qty = row.returnable;
    this.touch();
  }

  /** Every batch of a product at its full returnable qty. */
  returnAllOf(group: ReturnGroup): void {
    group.batches.forEach(r => (r.qty = r.returnable || null));
    this.touch();
  }

  step(row: ReturnRow, by: number): void {
    const next = Math.min(row.returnable, Math.max(0, (Number(row.qty) || 0) + by));
    row.qty = next || null;
    this.touch();
  }

  rowError(row: ReturnRow): string | null {
    const q = Number(row.qty) || 0;
    if (!row.qty) return null;
    if (!Number.isInteger(q) || q < 0) return 'Qty must be a whole number.';
    if (q > row.returnable) return `Only ${row.returnable} can be returned from this batch.`;
    return null;
  }

  /** Batches of the added products only. */
  private readonly pickedRows = computed(() => {
    const ids = new Set(this.picked());
    return this.rows().filter(r => ids.has(r.productId));
  });

  readonly summary = computed(() => {
    const list = this.pickedRows();
    const qty = list.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const value = list.reduce((s, r) => s + (Number(r.qty) || 0) * r.unitPrice, 0);
    return { qty, value, products: this.picked().length, batches: list.filter(r => Number(r.qty) > 0).length };
  });

  async save(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    const inward = this.inward();
    if (!inward || !this.reason || this.saving()) return;
    if (!this.picked().length) return void this.error.set('Add at least one product to return.');
    if (this.pickedRows().some(r => this.rowError(r))) return;
    if (!this.summary().qty) return void this.error.set('Enter a return qty for at least one batch.');

    this.saving.set(true);
    const result = await this.purchase.recordReturn({
      grnId: inward.id,
      reason: this.reason,
      returnType: this.returnType,
      remarks: this.remarks.trim(),
      raiseNote: this.raiseNote,
      lines: this.pickedRows().filter(r => Number(r.qty) > 0).map(r => ({ productId: r.productId, batchNo: r.batchNo, qty: Number(r.qty) })),
    });
    this.saving.set(false);
    if (result) this.dialogRef.close(result);
  }

  close(): void {
    this.dialogRef.close();
  }
}
