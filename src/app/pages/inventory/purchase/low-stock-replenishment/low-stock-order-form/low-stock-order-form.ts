import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { LowStockRow, PurchaseOrder, inr } from '../../../../../shared/models/purchase.model';

export interface LowStockOrderData {
  rows: LowStockRow[];
  vendors: { id: number; name: string }[];
  threshold: number;
  /** Products to start with (row action); empty = every low product. */
  productIds: string[];
}

interface Line { key: number; productId: string | null; vendorId: number | null; qty: number }

/**
 * Create Purchase Order for Central Store low-stock products. Each line picks a product, its vendor (the dropdown lists the
 * least price first and pre-selects it) and the qty. Lines are grouped by vendor: one purchase order per vendor is raised
 * straight away (no request / quote step) and its invoice goes to the vendor by e-mail + WhatsApp.
 * Closes with the raised orders.
 */
@Component({
  selector: 'app-low-stock-order-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './low-stock-order-form.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', './low-stock-order-form.scss'],
})
export class LowStockOrderForm {
  private readonly dialogRef = inject(MatDialogRef<LowStockOrderForm, PurchaseOrder[]>);
  private readonly purchase = inject(PurchaseService);
  readonly data = inject<LowStockOrderData>(MAT_DIALOG_DATA);
  readonly inr = inr;

  private seq = 0;
  readonly lines = signal<Line[]>(this.initialLines());
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly today = this.isoToday();
  expectedAt = '';
  notes = '';

  /** Lines grouped by vendor = the purchase orders that will be raised. */
  readonly groups = computed(() => {
    const map = new Map<number, { vendorId: number; vendorName: string; count: number; total: number }>();
    for (const l of this.lines()) {
      if (!l.vendorId || !l.productId) continue;
      const g = map.get(l.vendorId) ?? { vendorId: l.vendorId, vendorName: this.vendorName(l.vendorId), count: 0, total: 0 };
      g.count++;
      g.total += this.amount(l);
      map.set(l.vendorId, g);
    }
    return [...map.values()];
  });

  readonly totals = computed(() => {
    let sub = 0, gst = 0;
    for (const l of this.lines()) {
      const p = this.price(l);
      const base = (l.qty || 0) * p.unitPrice;
      sub += base;
      gst += base * p.gstPercent / 100;
    }
    return { subTotal: sub, gst, grandTotal: sub + gst };
  });

  private initialLines(): Line[] {
    const wanted = this.data.productIds.length ? this.data.rows.filter(r => this.data.productIds.includes(r.productId)) : this.data.rows;
    const list = wanted.map(r => ({ key: ++this.seq, productId: r.productId, vendorId: r.quotes[0]?.vendorId ?? r.vendorId, qty: r.suggestedQty }));
    return list.length ? list : [this.blank()];
  }

  private blank(): Line {
    return { key: ++this.seq, productId: null, vendorId: null, qty: 1 };
  }

  row(l: Line): LowStockRow | undefined {
    return this.data.rows.find(r => r.productId === l.productId);
  }

  isTaken(productId: string, l: Line): boolean {
    return this.lines().some(x => x !== l && x.productId === productId);
  }

  /** Vendors with a price for the product first (least first), then every other vendor. */
  vendorOptions(l: Line): { id: number; label: string }[] {
    const r = this.row(l);
    const priced = (r?.quotes ?? []).map((q, i) => ({ id: q.vendorId, label: `${q.vendorName} - ${inr(q.amount)}${i === 0 ? '  ★ least price' : ''}` }));
    const ids = new Set(priced.map(p => p.id));
    return [...priced, ...this.data.vendors.filter(v => !ids.has(v.id)).map(v => ({ id: v.id, label: `${v.name} - no price yet` }))];
  }

  isLeast(l: Line): boolean {
    const r = this.row(l);
    return !!r?.quotes.length && r.quotes[0].vendorId === l.vendorId;
  }

  /** The chosen vendor's price for the line, else the product master price. */
  price(l: Line): { unitPrice: number; gstPercent: number; source: string } {
    const r = this.row(l);
    if (!r) return { unitPrice: 0, gstPercent: 0, source: '' };
    const q = r.quotes.find(x => x.vendorId === l.vendorId);
    return q ? { unitPrice: q.unitPrice, gstPercent: q.gstPercent, source: q.source } : { unitPrice: r.unitPrice, gstPercent: r.gstPercent, source: 'Product master' };
  }

  amount(l: Line): number {
    const p = this.price(l);
    return (l.qty || 0) * p.unitPrice * (1 + p.gstPercent / 100);
  }

  vendorName(id: number | null): string {
    return this.data.vendors.find(v => v.id === id)?.name ?? this.data.rows.flatMap(r => r.quotes).find(q => q.vendorId === id)?.vendorName ?? '-';
  }

  update(l: Line, patch: Partial<Line>): void {
    this.lines.update(list => list.map(x => (x.key === l.key ? { ...x, ...patch } : x)));
  }

  /** A new product starts on its least-price vendor and suggested qty. */
  setProduct(l: Line, productId: string | null): void {
    const r = this.data.rows.find(x => x.productId === productId);
    this.update(l, { productId, vendorId: r ? (r.quotes[0]?.vendorId ?? r.vendorId) : null, qty: r?.suggestedQty ?? 1 });
  }

  setQty(l: Line, value: unknown): void {
    this.update(l, { qty: Math.floor(Number(value)) || 0 });
  }

  addLine(): void {
    this.lines.update(list => [...list, this.blank()]);
  }

  removeLine(l: Line): void {
    if (this.lines().length > 1) this.lines.update(list => list.filter(x => x.key !== l.key));
  }

  useLeastPrices(): void {
    this.lines.update(list => list.map(l => {
      const best = this.row(l)?.quotes[0];
      return best ? { ...l, vendorId: best.vendorId } : l;
    }));
  }

  lineError(l: Line): string {
    if (!l.productId) return 'Select the product.';
    if (!l.vendorId) return 'Select the vendor.';
    if (!Number.isInteger(l.qty) || l.qty < 1) return 'Enter qty (min 1).';
    return '';
  }

  close(): void {
    this.dialogRef.close();
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set('');
    if (this.lines().some(l => this.lineError(l))) return void this.error.set('Fix the highlighted product lines.');
    if (this.expectedAt && this.expectedAt < this.today) return void this.error.set('Expected delivery cannot be in the past.');

    this.saving.set(true);
    const orders = await this.purchase.createLowStockOrder(
      this.lines().map(l => ({ productId: l.productId as string, qty: l.qty, vendorId: l.vendorId as number })),
      this.expectedAt || null,
      this.notes.trim(),
    );
    this.saving.set(false);
    if (orders) this.dialogRef.close(orders);
  }

  private isoToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
