import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE_KEY, PurchaseLineItem, PurchaseOrder, VendorOption, VendorQuote, displayDate, lineTotals } from '../../../../../shared/models/purchase.model';
import { CanActionDirective } from '../../../../../shared/directives/can-action.directive';

/** One vendor's price for one product of the request. */
interface VendorOffer {
  vendorId: number;
  vendorName: string;
  price: number;
  gst: number;
  /** Unit price incl. GST - what vendors are compared on. */
  landed: number;
  /** "Quote QT-12", "Last quote", "Product price", ... */
  source: string;
  /** The vendor's valid quotation for this request prices this product. */
  quoted: boolean;
  quoteId: number | null;
  hasFile: boolean;
}

/** A purchase order the approval will raise: one per vendor chosen in the table. */
interface PoGroup { vendorId: number; vendorName: string; products: string[]; total: number; quoted: number }

export interface ReviewResult {
  action: 'approved' | 'rejected';
  /** The first raised order (older callers open its invoice). */
  order?: PurchaseOrder;
  orders?: PurchaseOrder[];
}

/**
 * Head-office view of a purchase request: details, then approve or reject. Each requested product picks its own vendor in the table
 * (least landed price first and pre-selected: a valid quotation, else the vendor's price list, else the product price), so a request
 * can be split across vendors - approving raises one purchase order per vendor. A vendor's proforma quotation is added or opened from
 * the product's row. Moving stock from a nearby branch is done in Stock & Transfer.
 */
@Component({
  selector: 'app-purchase-request-review',
  standalone: true,
  imports: [CanActionDirective, CommonModule, FormsModule, MatDialogModule],
  templateUrl: './purchase-request-review.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', './purchase-request-review.scss'],
})
export class PurchaseRequestReview {
  private readonly dialogRef = inject(MatDialogRef<PurchaseRequestReview, ReviewResult>);
  private readonly data = inject<{ requestId: string; queue?: { index: number; total: number } }>(MAT_DIALOG_DATA);
  /** Set while the head office walks through the urgent requests one by one. */
  readonly queue = this.data.queue ?? null;
  readonly purchase = inject(PurchaseService);

  readonly request = computed(() => this.purchase.requests().find(r => r.id === this.data.requestId)!);
  readonly totals = computed(() => lineTotals(this.request().items));
  readonly canReview = computed(() => this.request().status === 'Pending' && this.purchase.canApproveRequests());
  readonly displayDate = displayDate;

  remarks = '';
  readonly remarksError = signal(false);
  readonly saving = signal(false);

  private readonly inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  readonly inrText = (n: number): string => this.inr.format(n);

  // ---- vendor per product
  readonly quotes = signal<VendorQuote[]>([]);
  readonly estimates = signal<VendorOption[]>([]);
  readonly canManageQuotes = signal(false);
  /** Vendor chosen for each product (productId -> vendorId). */
  readonly lineVendor = signal<Record<string, number | null>>({});
  readonly vendorErrors = signal(false);
  /** Row that just changed vendor (flash animation). */
  readonly flashRow = signal<string | null>(null);

  /** Every vendor's price for each product, least landed price first. */
  readonly offers = computed<Record<string, VendorOffer[]>>(() => {
    const items = this.request().items;
    const validQuotes = this.quotes().filter(q => !q.expired);
    const names = new Map<number, string>();
    this.purchase.vendors().forEach(v => names.set(v.id, v.name));
    this.estimates().forEach(o => names.set(o.vendorId, o.name));
    validQuotes.forEach(q => names.set(q.vendorId, q.vendorName));

    const out: Record<string, VendorOffer[]> = {};
    for (const item of items) {
      const list: VendorOffer[] = [];
      for (const [vendorId, vendorName] of names) {
        const q = validQuotes.find(x => x.vendorId === vendorId);
        const qi = q?.items.find(i => i.productId === item.productId);
        const est = this.estimates().find(o => o.vendorId === vendorId)?.lines.find(l => l.productId === item.productId);
        const price = qi ? qi.quotedPrice : est ? est.price : item.unitPrice;
        const gst = qi ? qi.gstPercent : est ? est.gstPercent : item.gstPercent;
        list.push({
          vendorId, vendorName, price, gst, landed: price * (1 + gst / 100),
          source: qi ? `Quote ${q!.quoteNo}` : est ? this.sourceLabel(est.source) : 'Product price',
          quoted: !!qi, quoteId: q?.id ?? null, hasFile: !!(qi && q?.hasFile),
        });
      }
      // least landed price first; on a tie a quoted vendor first
      out[item.productId] = list.sort((a, b) => a.landed - b.landed || Number(b.quoted) - Number(a.quoted) || a.vendorName.localeCompare(b.vendorName));
    }
    return out;
  });

  /** Vendor dropdown value of a product (null = none chosen). */
  vendorOf(productId: string): number | null {
    return this.lineVendor()[productId] ?? null;
  }

  /** A product's vendor options, least landed price first. */
  offersFor(productId: string): VendorOffer[] {
    return this.offers()[productId] ?? [];
  }

  /** The chosen vendor's offer for a product (null until a vendor is picked). */
  offer(productId: string): VendorOffer | null {
    const v = this.lineVendor()[productId];
    return v ? this.offers()[productId]?.find(o => o.vendorId === v) ?? null : null;
  }

  isLeast(productId: string): boolean {
    const o = this.offer(productId);
    const best = this.offers()[productId]?.[0];
    return !!o && !!best && o.landed <= best.landed + 0.005;
  }

  /** % of the chosen price against the request price. */
  delta(productId: string): number {
    const item = this.request().items.find(i => i.productId === productId);
    const o = this.offer(productId);
    return item && o && item.unitPrice > 0 ? ((o.price - item.unitPrice) / item.unitPrice) * 100 : 0;
  }

  /** Line amount (incl. GST) at the chosen vendor's price, else the request price. */
  lineAmount(item: PurchaseLineItem): number {
    const o = this.offer(item.productId);
    return item.requestedQty * (o ? o.landed : item.unitPrice * (1 + item.gstPercent / 100));
  }

  /** Totals of the order at the chosen prices. */
  readonly orderTotals = computed(() => {
    let sub = 0, gst = 0;
    for (const item of this.request().items) {
      const o = this.offer(item.productId);
      const price = o ? o.price : item.unitPrice;
      const rate = o ? o.gst : item.gstPercent;
      sub += price * item.requestedQty;
      gst += price * item.requestedQty * rate / 100;
    }
    return { subTotal: sub, gst, grandTotal: sub + gst };
  });

  /** The purchase orders the approval will raise (one per chosen vendor). */
  readonly poGroups = computed<PoGroup[]>(() => {
    const map = new Map<number, PoGroup>();
    for (const item of this.request().items) {
      const o = this.offer(item.productId);
      if (!o) continue;
      const g = map.get(o.vendorId) ?? { vendorId: o.vendorId, vendorName: o.vendorName, products: [], total: 0, quoted: 0 };
      g.products.push(item.productName);
      g.total += this.lineAmount(item);
      if (o.quoted) g.quoted++;
      map.set(o.vendorId, g);
    }
    return [...map.values()];
  });

  readonly allChosen = computed(() => this.request().items.every(i => !!this.lineVendor()[i.productId]));

  constructor() {
    // On-hand qty shown per line; stock is not part of the Purchase Requests tab load.
    void this.purchase.reload('stock');
    void this.loadQuotes();
  }

  private async loadQuotes(): Promise<void> {
    if (!this.canReview()) return;
    const id = this.request().id;
    const [{ items, canManage }, estimates] = await Promise.all([this.purchase.requestQuotes(id), this.purchase.requestVendorOptions(id)]);
    this.quotes.set(items);
    this.canManageQuotes.set(canManage);
    this.estimates.set(estimates);
    this.preselect();
  }

  /** Every product without a vendor yet gets its least-price vendor. */
  private preselect(): void {
    const current = { ...this.lineVendor() };
    for (const item of this.request().items) {
      if (!current[item.productId]) current[item.productId] = this.offers()[item.productId]?.[0]?.vendorId ?? null;
    }
    this.lineVendor.set(current);
  }

  setLineVendor(productId: string, vendorId: number | null): void {
    this.lineVendor.update(v => ({ ...v, [productId]: vendorId === null ? null : Number(vendorId) }));
    this.vendorErrors.set(false);
    if (this.proformaRow() === productId) this.closeRowProforma();
    this.flashRow.set(productId);
    setTimeout(() => { if (this.flashRow() === productId) this.flashRow.set(null); }, 900);
  }

  /** Each product back to its least-price vendor. */
  useLeastPrices(): void {
    const next: Record<string, number | null> = {};
    for (const item of this.request().items) next[item.productId] = this.offers()[item.productId]?.[0]?.vendorId ?? null;
    this.lineVendor.set(next);
    this.closeRowProforma();
  }

  /** Short label of a price-list source. */
  sourceLabel(source?: string): string {
    return source === 'last quote' ? 'Last quote' : source === 'product price' ? 'Product price' : source ? 'Master price · to confirm' : '';
  }

  viewQuoteFile(quoteId: number | null): void {
    if (quoteId) this.purchase.openProforma(`request-quotes/${quoteId}/file`);
  }

  // ---- proforma quotation of a product's vendor (a panel opens under the product)

  readonly today = new Date().toISOString().slice(0, 10);
  /** Product whose row shows the proforma panel (null = closed). */
  readonly proformaRow = signal<string | null>(null);
  readonly pfDragging = signal(false);
  readonly quoteSaving = signal(false);
  readonly quoteError = signal('');
  readonly quoteFileName = signal('');
  readonly quoteFileSize = signal(0);
  readonly quoteFileKind = signal('');
  quoteForm = { quoteNo: '', quoteDate: this.today, validTill: '', remarks: '', prices: {} as Record<string, number | null> };
  private quoteFile: File | null = null;
  private quoteFileBase = '';
  private quoteFileExt = '';

  /** Vendor of the open proforma panel. */
  readonly pfVendorId = computed(() => {
    const p = this.proformaRow();
    return p ? this.lineVendor()[p] ?? null : null;
  });
  pfVendorName(): string {
    const p = this.proformaRow();
    return (p && this.offer(p)?.vendorName) || 'Vendor';
  }
  /** The vendor's existing quotation for this request (replaced on save). */
  pfExistingQuote(): VendorQuote | null {
    const v = this.pfVendorId();
    return v ? this.quotes().find(q => q.vendorId === v) ?? null : null;
  }
  /** Products the panel's vendor supplies on this request: the row's product first, then the others chosen for it. */
  pfProducts(): PurchaseLineItem[] {
    const p = this.proformaRow();
    const v = this.pfVendorId();
    const items = this.request().items;
    return items.filter(i => i.productId === p).concat(items.filter(i => i.productId !== p && v !== null && this.lineVendor()[i.productId] === v));
  }

  /** Add / replace the proforma of the product's vendor, pre-filled with its current prices. */
  openRowProforma(productId: string): void {
    if (!this.lineVendor()[productId]) return void this.vendorErrors.set(true);
    this.proformaRow.set(productId);
    this.pfDragging.set(false);
    this.quoteError.set('');
    this.setQuoteFile(null);
    this.quoteForm = {
      quoteNo: '', quoteDate: this.today, validTill: '', remarks: '',
      prices: Object.fromEntries(this.pfProducts().map(i => [i.productId, this.offer(i.productId)?.price ?? i.unitPrice])),
    };
    setTimeout(() => document.querySelector('.pf-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  closeRowProforma(): void {
    this.proformaRow.set(null);
    this.pfDragging.set(false);
  }

  onQuoteFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) this.setQuoteFile(file);
  }

  onProformaDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.pfDragging.set(true);
  }

  onProformaDragLeave(event: DragEvent): void {
    const to = event.relatedTarget as Node | null;
    if (!to || !(event.currentTarget as HTMLElement).contains(to)) this.pfDragging.set(false);
  }

  onProformaDrop(event: DragEvent): void {
    event.preventDefault();
    this.pfDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setQuoteFile(file);
  }

  clearQuoteFile(): void {
    this.setQuoteFile(null);
  }

  /** Picked / dropped proforma: PDF / JPG / PNG / WEBP up to 4 MB. */
  private setQuoteFile(file: File | null): void {
    if (file && !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return void this.quoteError.set('Attach a PDF, JPG, PNG or WEBP file.');
    if (file && file.size > 4 * 1024 * 1024) return void this.quoteError.set('The file must be 4 MB or smaller.');
    this.quoteError.set('');
    this.quoteFile = file;
    this.quoteFileName.set(file?.name ?? '');
    this.quoteFileSize.set(file?.size ?? 0);
    this.quoteFileKind.set(file ? (file.name.split('.').pop() || 'file').toUpperCase().slice(0, 4) : '');
    const dot = file ? file.name.lastIndexOf('.') : -1;
    this.quoteFileBase = file ? (dot > 0 ? file.name.slice(0, dot) : file.name) : '';
    this.quoteFileExt = file && dot > 0 ? file.name.slice(dot) : '';
  }

  fileSize(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /** Per-unit price incl. GST typed for a product (null until a price is entered). */
  quoteLanded(productId: string): number | null {
    const item = this.request().items.find(i => i.productId === productId);
    const v = this.quoteForm.prices[productId];
    return item && v !== null && v !== undefined && String(v) !== '' && Number(v) > 0 ? Number(v) * (1 + item.gstPercent / 100) : null;
  }

  /** Request unit price incl. GST of a product (what the quoted price is compared with). */
  requestLanded(productId: string): number {
    const item = this.request().items.find(i => i.productId === productId);
    return item ? item.unitPrice * (1 + item.gstPercent / 100) : 0;
  }

  quoteFormTotal(): number {
    return this.pfProducts().reduce((s, i) => s + (this.quoteLanded(i.productId) ?? 0) * i.requestedQty, 0);
  }

  /** Saves the vendor's proforma quotation for its products on this request (a new one replaces the vendor's earlier quote). */
  async saveQuote(): Promise<void> {
    if (this.quoteSaving()) return;
    const vendorId = this.pfVendorId();
    if (vendorId === null) return void this.quoteError.set('Choose the vendor first.');
    if (!this.quoteForm.quoteNo.trim()) return void this.quoteError.set('Enter the proforma / quotation number.');
    if (!this.quoteForm.quoteDate || this.quoteForm.quoteDate > this.today) return void this.quoteError.set('Enter a quotation date that is not in the future.');
    const products = this.pfProducts();
    const unpriced = products.find(i => !(Number(this.quoteForm.prices[i.productId]) > 0));
    if (unpriced) return void this.quoteError.set(`Enter the quoted unit price of ${unpriced.productName}.`);
    if (this.quoteForm.validTill && this.quoteForm.validTill < this.quoteForm.quoteDate) return void this.quoteError.set('Valid till cannot be before the quote date.');
    if (!this.quoteFile) return void this.quoteError.set("Attach the vendor's proforma quotation.");
    this.quoteError.set('');

    const body = new FormData();
    body.append('vendor_id', String(vendorId));
    body.append('quote_no', this.quoteForm.quoteNo.trim());
    body.append('quote_date', this.quoteForm.quoteDate);
    if (this.quoteForm.validTill) body.append('valid_till', this.quoteForm.validTill);
    body.append('items', JSON.stringify(products.map(i => ({ product_id: Number(i.productId), quoted_price: Number(this.quoteForm.prices[i.productId]) }))));
    const base = this.quoteFileBase.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'vendor-quote';
    body.append('file', this.quoteFile, base + this.quoteFileExt);

    this.quoteSaving.set(true);
    const ok = await this.purchase.addRequestQuote(this.request().id, body);
    if (ok) {
      const { items: quotes } = await this.purchase.requestQuotes(this.request().id);
      this.quotes.set(quotes);
      this.closeRowProforma();
    }
    this.quoteSaving.set(false);
  }

  centralQty(productId: string): number {
    return this.purchase.storeQtyByKey(CENTRAL_STORE_KEY, productId);
  }

  branchQty(productId: string): number {
    return this.purchase.storeQtyByKey(this.request().branchKey ?? CENTRAL_STORE_KEY, productId);
  }

  statusClass(): string {
    return { Pending: 'orange', Approved: 'green', Rejected: 'red' }[this.request().status];
  }

  /** Approving raises one purchase order per chosen vendor, each product at the price shown in its row. */
  async approve(): Promise<void> {
    if (this.saving()) return;
    if (!this.allChosen()) {
      this.vendorErrors.set(true);
      return;
    }
    this.saving.set(true);
    const orders = await this.purchase.approveRequestSplit(this.request().id,
      this.request().items.map(i => ({ productId: i.productId, vendorId: this.lineVendor()[i.productId]!, price: this.offer(i.productId)?.price ?? null })),
      this.remarks.trim());
    this.saving.set(false);
    if (orders?.length) this.dialogRef.close({ action: 'approved', order: orders[0], orders } satisfies ReviewResult);
  }

  async reject(): Promise<void> {
    if (!this.remarks.trim()) {
      this.remarksError.set(true);
      document.getElementById('rv-remarks')?.focus();
      return;
    }
    if (this.saving()) return;
    this.saving.set(true);
    const ok = await this.purchase.rejectRequest(this.request().id, this.remarks.trim());
    this.saving.set(false);
    if (ok) this.dialogRef.close({ action: 'rejected' });
  }

  close(): void {
    this.dialogRef.close();
  }
}
