import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../shared/common-services/purchase.service';
import { LowStockRow, LowStockVendorQuote, PurchaseOrder, inr } from '../../../../shared/models/purchase.model';

export interface LowStockOrderData {
  rows: LowStockRow[];
  vendors: { id: number; name: string }[];
  threshold: number;
  /** Products to start with (bell alert); empty = every low product. */
  productIds: string[];
}

interface Line { key: number; productId: string | null; vendorId: number | null; qty: number }

/** The "Add proforma" panel of one line (the vendor's quotation file + its price for the product). */
interface ProformaDraft {
  lineKey: number;
  quoteNo: string;
  quoteDate: string;
  validTill: string;
  unitPrice: number | null;
  gstPercent: number | null;
  file: File | null;
  saving: boolean;
  error: string;
}

const MAX_QTY = 100000;
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_MB = 4;

/**
 * Create Purchase Order for Central Store low-stock products. Each line picks a product, its vendor (least price first and
 * pre-selected) and the qty (- / + stepper). The vendor's proforma quotation opens in a new tab when one is on file; otherwise
 * it can be attached right on the line (its price then becomes that vendor's price). Lines are grouped by vendor: one purchase
 * order per vendor is raised straight away (no request / quote step) and its invoice goes to the vendor by e-mail + WhatsApp.
 * Closes with the raised orders.
 */
@Component({
  selector: 'app-low-stock-order-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './low-stock-order-form.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './low-stock-order-form.scss'],
})
export class LowStockOrderForm {
  private readonly dialogRef = inject(MatDialogRef<LowStockOrderForm, PurchaseOrder[]>);
  private readonly purchase = inject(PurchaseService);
  readonly data = inject<LowStockOrderData>(MAT_DIALOG_DATA);
  readonly inr = inr;
  readonly maxQty = MAX_QTY;

  /** Low products with their vendor prices; re-read after a proforma is added. */
  readonly rows = signal<LowStockRow[]>(this.data.rows);
  readonly vendors = signal(this.data.vendors);

  private seq = 0;
  readonly lines = signal<Line[]>(this.initialLines());
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly today = this.isoToday();
  readonly proforma = signal<ProformaDraft | null>(null);
  expectedAt = '';
  notes = '';

  /** The product the form was opened for (bell alert), shown in the banner. */
  readonly focusRow = computed(() => (this.data.productIds.length === 1 ? this.rows().find(r => r.productId === this.data.productIds[0]) : undefined));

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
    const rows = this.data.rows;
    const wanted = this.data.productIds.length ? rows.filter(r => this.data.productIds.includes(r.productId)) : rows;
    const list = wanted.map(r => ({ key: ++this.seq, productId: r.productId, vendorId: r.quotes[0]?.vendorId ?? r.vendorId, qty: r.suggestedQty }));
    return list.length ? list : [this.blank()];
  }

  private blank(): Line {
    return { key: ++this.seq, productId: null, vendorId: null, qty: 1 };
  }

  row(l: Line): LowStockRow | undefined {
    return this.rows().find(r => r.productId === l.productId);
  }

  isTaken(productId: string, l: Line): boolean {
    return this.lines().some(x => x !== l && x.productId === productId);
  }

  /** Vendors with a price for the product first (least first), then every other vendor. */
  vendorOptions(l: Line): { id: number; label: string }[] {
    const r = this.row(l);
    const priced = (r?.quotes ?? []).map((q, i) => ({ id: q.vendorId, label: `${q.vendorName}  ·  ${inr(q.amount)}${i === 0 ? '  ★ Least price' : ''}` }));
    const ids = new Set(priced.map(p => p.id));
    return [...priced, ...this.vendors().filter(v => !ids.has(v.id)).map(v => ({ id: v.id, label: `${v.name}  ·  no price yet` }))];
  }

  /** The chosen vendor's price entry for the line (null: the vendor has not priced the product). */
  quote(l: Line): LowStockVendorQuote | null {
    return this.row(l)?.quotes.find(q => q.vendorId === l.vendorId) ?? null;
  }

  isLeast(l: Line): boolean {
    const r = this.row(l);
    return !!r?.quotes.length && r.quotes[0].vendorId === l.vendorId;
  }

  /** The chosen vendor's price for the line, else the product master price. */
  price(l: Line): { unitPrice: number; gstPercent: number; source: string } {
    const r = this.row(l);
    if (!r) return { unitPrice: 0, gstPercent: 0, source: '' };
    const q = this.quote(l);
    return q ? { unitPrice: q.unitPrice, gstPercent: q.gstPercent, source: q.source } : { unitPrice: r.unitPrice, gstPercent: r.gstPercent, source: 'Product master' };
  }

  amount(l: Line): number {
    const p = this.price(l);
    return (l.qty || 0) * p.unitPrice * (1 + p.gstPercent / 100);
  }

  vendorName(id: number | null): string {
    return this.vendors().find(v => v.id === id)?.name ?? this.rows().flatMap(r => r.quotes).find(q => q.vendorId === id)?.vendorName ?? '-';
  }

  update(l: Line, patch: Partial<Line>): void {
    this.lines.update(list => list.map(x => (x.key === l.key ? { ...x, ...patch } : x)));
  }

  /** A new product starts on its least-price vendor and suggested qty. */
  setProduct(l: Line, productId: string | null): void {
    const r = this.rows().find(x => x.productId === productId);
    this.update(l, { productId, vendorId: r ? (r.quotes[0]?.vendorId ?? r.vendorId) : null, qty: r?.suggestedQty ?? 1 });
    if (this.proforma()?.lineKey === l.key) this.proforma.set(null);
  }

  setVendor(l: Line, vendorId: number | null): void {
    this.update(l, { vendorId });
    if (this.proforma()?.lineKey === l.key) this.proforma.set(null);
  }

  setQty(l: Line, value: unknown): void {
    this.update(l, { qty: Math.min(MAX_QTY, Math.max(0, Math.floor(Number(value)) || 0)) });
  }

  /** − / + buttons of the order qty (never below 1). */
  stepQty(l: Line, by: number): void {
    this.update(l, { qty: Math.min(MAX_QTY, Math.max(1, (l.qty || 0) + by)) });
  }

  addLine(): void {
    this.lines.update(list => [...list, this.blank()]);
  }

  removeLine(l: Line): void {
    if (this.lines().length > 1) this.lines.update(list => list.filter(x => x.key !== l.key));
    if (this.proforma()?.lineKey === l.key) this.proforma.set(null);
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

  // ---- vendor proforma quotation

  /** Opens the vendor's proforma quotation in a new tab (streamed with the signed-in session). */
  viewProforma(l: Line): void {
    const q = this.quote(l);
    if (q?.quoteId && q.hasFile) this.purchase.openProforma(`request-quotes/${q.quoteId}/file`);
  }

  openProforma(l: Line): void {
    const p = this.price(l);
    this.proforma.set({
      lineKey: l.key, quoteNo: '', quoteDate: this.today, validTill: '',
      unitPrice: p.unitPrice || null, gstPercent: p.gstPercent, file: null, saving: false, error: '',
    });
  }

  closeProforma(): void {
    this.proforma.set(null);
    this.pfDragging.set(false);
  }

  patchProforma(patch: Partial<ProformaDraft>): void {
    this.proforma.update(d => (d ? { ...d, ...patch, error: '' } : d));
  }

  /** True while a file is dragged over the drop zone. */
  readonly pfDragging = signal(false);

  pickProformaFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) this.setProformaFile(file);
  }

  onProformaDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.pfDragging.set(true);
  }

  onProformaDragLeave(event: DragEvent): void {
    // leaving for a child element of the zone is not leaving the zone
    const to = event.relatedTarget as Node | null;
    if (!to || !(event.currentTarget as HTMLElement).contains(to)) this.pfDragging.set(false);
  }

  onProformaDrop(event: DragEvent): void {
    event.preventDefault();
    this.pfDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setProformaFile(file);
  }

  private setProformaFile(file: File): void {
    if (!FILE_TYPES.includes(file.type)) return void this.proforma.update(d => (d ? { ...d, error: 'Attach a PDF, JPG, PNG or WEBP file.' } : d));
    if (file.size > MAX_FILE_MB * 1024 * 1024) return void this.proforma.update(d => (d ? { ...d, error: `The file must be ${MAX_FILE_MB} MB or smaller.` } : d));
    this.patchProforma({ file });
  }

  clearProformaFile(): void {
    this.patchProforma({ file: null });
  }

  /** "PDF" / "JPG" ... badge of the picked file. */
  fileKind(file: File): string {
    return (file.name.split('.').pop() || file.type.split('/').pop() || 'file').toUpperCase().slice(0, 4);
  }

  fileSize(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /** Per-unit price incl. GST of the quotation being entered (null until a price is typed). */
  pfLanded(d: ProformaDraft): number | null {
    const price = Number(d.unitPrice);
    return price > 0 ? price * (1 + (Number(d.gstPercent) || 0) / 100) : null;
  }

  /** Per-unit price incl. GST the line uses now - compared with the quotation being entered. */
  currentLanded(l: Line): number {
    const p = this.price(l);
    return p.unitPrice * (1 + p.gstPercent / 100);
  }

  async saveProforma(l: Line): Promise<void> {
    const d = this.proforma();
    if (!d || d.saving || !l.productId || !l.vendorId) return;
    const fail = (error: string) => this.proforma.update(x => (x ? { ...x, error } : x));
    if (!d.quoteNo.trim()) return fail('Enter the proforma / quotation number.');
    if (!d.quoteDate || d.quoteDate > this.today) return fail('Enter a quotation date that is not in the future.');
    if (d.validTill && d.validTill < this.today) return fail('This quotation has already expired - check the valid-till date.');
    if (!(Number(d.unitPrice) > 0)) return fail('Enter the quoted unit price.');
    if (d.gstPercent !== null && (Number(d.gstPercent) < 0 || Number(d.gstPercent) > 100)) return fail('GST must be between 0 and 100%.');
    if (!d.file) return fail("Attach the vendor's proforma quotation.");

    const form = new FormData();
    form.append('vendor_id', String(l.vendorId));
    form.append('quote_no', d.quoteNo.trim());
    form.append('quote_date', d.quoteDate);
    if (d.validTill) form.append('valid_till', d.validTill);
    form.append('items', JSON.stringify([{ product_id: Number(l.productId), quoted_price: Number(d.unitPrice), gst_percent: d.gstPercent ?? null }]));
    form.append('file', d.file, d.file.name);

    this.proforma.update(x => (x ? { ...x, saving: true } : x));
    const ok = await this.purchase.addLowStockProforma(form);
    if (!ok) return void this.proforma.update(x => (x ? { ...x, saving: false } : x));

    // re-read the prices: the line now shows this quotation (and its "View proforma" link)
    try {
      const fresh = await this.purchase.lowStockOrders();
      this.rows.set(fresh.rows.length ? fresh.rows : this.rows());
      this.vendors.set(fresh.vendors.length ? fresh.vendors : this.vendors());
    } catch { /* keep the current list; the saved quote shows next time */ }
    this.closeProforma();
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
