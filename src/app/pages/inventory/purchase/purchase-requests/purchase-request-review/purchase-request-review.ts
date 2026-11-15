import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE_KEY, PurchaseOrder, VendorOption, VendorQuote, displayDate, lineTotals } from '../../../../../shared/models/purchase.model';
import { CanActionDirective } from '../../../../../shared/directives/can-action.directive';
import { SearchSelect, SelectOption } from '../../../../../shared/components/search-select/search-select';

interface PriceRow {
  productId: string;
  name: string;
  code: string;
  qty: number;
  requestPrice: number;
  price: number;
  gst: number;
  amount: number;
  /** % change of the vendor price against the request price. */
  delta: number;
  /** Price-list origin (estimate only): 'last quote' | 'product price' | 'master price (to confirm)'. */
  source?: string;
}

interface PriceView {
  kind: 'quote' | 'estimate';
  rows: PriceRow[];
  total: number;
  requestTotal: number;
}

export interface ReviewResult {
  action: 'approved' | 'rejected';
  order?: PurchaseOrder;
}

/**
 * Head-office view of a purchase request: details, then approve or reject. The vendor dropdown lists the vendors that sent a quote
 * first (least quote first - approving raises the PO at the quoted prices), then every other vendor without a quote (the PO is raised at
 * the product prices). Moving stock from a nearby branch is done in Stock & Transfer.
 */
@Component({
  selector: 'app-purchase-request-review',
  standalone: true,
  imports: [CanActionDirective, CommonModule, FormsModule, MatDialogModule, SearchSelect],
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

  // ---- vendor dropdown. "q:<quoteId>" = a vendor quote (quoted prices); "v:<vendorId>" = a vendor without a quote: it still gets an
  // estimated quote from its price list (last quote, else the product price, else the master price) so vendors can be compared.
  private readonly inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
  readonly quotes = signal<VendorQuote[]>([]);
  readonly estimates = signal<VendorOption[]>([]);
  /** Complete, unexpired quotes, least first. */
  private readonly usableQuotes = computed(() => this.quotes().filter(q => q.complete && !q.expired).sort((x, y) => x.total - y.total));
  /** Estimated quotes of the vendors that have no usable quote, least first. */
  private readonly estimateRows = computed(() => {
    const quoted = new Set(this.usableQuotes().map(q => q.vendorId));
    return this.estimates().filter(o => !quoted.has(o.vendorId)).sort((x, y) => x.estimate - y.estimate);
  });
  readonly vendorChoices = computed<SelectOption[]>(() => {
    const usable = this.usableQuotes();
    const quotedVendors = new Set(usable.map(q => q.vendorId));
    const quoted = usable.map(q => ({
      value: `q:${q.id}`, label: q.vendorName, hint: `${this.inr.format(q.total)} · ${q.quoteNo}${q.lowest ? ' · lowest' : ''}`, group: 'Vendor quotes - least first',
    }));
    const estimated = this.estimateRows().map((o, i) => ({
      value: `v:${o.vendorId}`, label: o.name,
      hint: `${this.inr.format(o.estimate)} · ${o.lines.some(l => l.source.startsWith('master')) ? 'est. price' : 'price list'}${i === 0 && !quoted.length && this.estimateRows().length > 1 ? ' · lowest' : ''}`,
      group: 'Vendors without a quote - price list, least first',
    }));
    const listed = new Set([...quotedVendors, ...this.estimateRows().map(o => o.vendorId)]);
    const others = this.purchase.vendors().filter(v => !listed.has(v.id)).map(v => ({ value: `v:${v.id}`, label: v.name, hint: 'product prices', group: 'Other vendors' }));
    return [...quoted, ...estimated, ...others];
  });
  readonly choice = signal<string | null>(null);
  readonly vendorError = signal(false);
  private readonly chosenQuote = computed(() => {
    const c = this.choice();
    return c?.startsWith('q:') ? this.usableQuotes().find(q => q.id === Number(c.slice(2))) ?? null : null;
  });
  private readonly chosenEstimate = computed(() => {
    const c = this.choice();
    return c?.startsWith('v:') ? this.estimateRows().find(o => o.vendorId === Number(c.slice(2))) ?? null : null;
  });
  readonly vendorName = computed(() => this.vendorChoices().find(o => o.value === this.choice())?.label ?? '');
  /** What the order will be worth: the quote total, else the vendor's price-list estimate, else the product-price total. */
  readonly choiceTotal = computed(() => this.chosenQuote()?.total ?? this.chosenEstimate()?.estimate ?? this.totals().grandTotal);
  readonly choiceBasis = computed(() => this.chosenQuote() ? 'the quoted prices' : this.chosenEstimate() ? "the vendor's price list" : 'the product prices');

  // ---- vendor quotation of the chosen vendor: shown when it already sent one, else the head office can add it here
  readonly today = new Date().toISOString().slice(0, 10);
  readonly canManageQuotes = signal(false);
  /** Vendor behind the current dropdown choice. */
  readonly chosenVendorId = computed<number | null>(() => {
    const c = this.choice();
    if (!c) return null;
    return c.startsWith('q:') ? this.quotes().find(q => q.id === Number(c.slice(2)))?.vendorId ?? null : Number(c.slice(2));
  });
  /** The quote the chosen vendor already sent for this request (also an expired or incomplete one). */
  readonly vendorQuote = computed(() => {
    const v = this.chosenVendorId();
    return v === null ? null : this.quotes().find(q => q.vendorId === v) ?? null;
  });
  /**
   * Product-wise prices of the chosen vendor: its saved quotation, else its price list (last quote / product price / master price).
   * null = a vendor with neither (the order goes at the product prices).
   */
  readonly priceView = computed<PriceView | null>(() => {
    const items = this.request().items;
    const byId = new Map(items.map(i => [i.productId, i]));
    const row = (productId: string, name: string, qty: number, price: number, gst: number, amount: number, source?: string): PriceRow => {
      const req = byId.get(productId)?.unitPrice ?? 0;
      return {
        productId, name, code: byId.get(productId)?.productCode ?? '', qty, requestPrice: req, price, gst, amount,
        delta: req > 0 ? ((price - req) / req) * 100 : 0, source,
      };
    };
    const q = this.vendorQuote();
    if (q) {
      const rows = q.items.map(i => row(i.productId, i.productName, i.qty, i.quotedPrice, i.gstPercent, i.amount));
      return { kind: 'quote', rows, total: q.total, requestTotal: this.totals().grandTotal };
    }
    const v = this.chosenVendorId();
    const est = v === null ? null : this.estimates().find(o => o.vendorId === v);
    if (est) {
      const rows = est.lines.map(l => row(l.productId, l.productName, l.qty, l.price, l.gstPercent, l.qty * l.price * (1 + l.gstPercent / 100), l.source));
      return { kind: 'estimate', rows, total: est.estimate, requestTotal: this.totals().grandTotal };
    }
    return null;
  });
  readonly showQuoteForm = signal(false);
  readonly quoteSaving = signal(false);
  readonly quoteError = signal('');
  readonly quoteFileName = signal('');
  quoteForm = { quoteNo: '', quoteDate: this.today, validTill: '', remarks: '', prices: {} as Record<string, number | null> };
  /** Editable name of the picked proforma (without the extension); the file is uploaded under this name. */
  quoteFileBase = '';
  quoteFileExt = '';
  private quoteFile: File | null = null;

  constructor() {
    // On-hand qty shown per line; stock is not part of the Purchase Requests tab load.
    void this.purchase.reload('stock');
    const ownVendor = this.request()?.vendorId;
    if (ownVendor) this.choice.set(`v:${ownVendor}`);
    void this.loadQuotes();
  }

  private async loadQuotes(): Promise<void> {
    if (!this.canReview()) return;
    const id = this.request().id;
    const [{ items, canManage }, estimates] = await Promise.all([this.purchase.requestQuotes(id), this.purchase.requestVendorOptions(id)]);
    this.quotes.set(items);
    this.canManageQuotes.set(canManage);
    this.estimates.set(estimates);
    // the least quote (else the least price list) is pre-selected, unless the approver already picked something
    const lowestQuote = this.usableQuotes()[0];
    const first = this.estimateRows()[0];
    if (this.choice() === null || this.choice()!.startsWith('v:')) {
      if (lowestQuote) this.choice.set(`q:${lowestQuote.id}`);
      else if (first) this.choice.set(`v:${first.vendorId}`);
    }
  }

  onChoice(value: string | null): void {
    this.choice.set(value);
    this.vendorError.set(false);
    this.showQuoteForm.set(false);
  }

  /** Request unit price of a product (to compare a quoted price against). */
  requestPrice(productId: string): number {
    return this.request().items.find(i => i.productId === productId)?.unitPrice ?? 0;
  }

  viewQuoteFile(quoteId: number): void {
    this.purchase.openProforma(`request-quotes/${quoteId}/file`);
  }

  /** Opens the quotation form for the chosen vendor, pre-filled with its current quote, else its last quoted / product prices. */
  async openQuoteForm(): Promise<void> {
    const vendorId = this.chosenVendorId();
    if (vendorId === null) return void this.vendorError.set(true);
    const existing = this.vendorQuote();
    this.quoteForm = {
      quoteNo: '', quoteDate: this.today, validTill: '', remarks: '',
      prices: Object.fromEntries(this.request().items.map(i => [i.productId, i.unitPrice])),
    };
    this.quoteFile = null;
    this.quoteFileName.set('');
    this.quoteFileBase = this.quoteFileExt = '';
    this.quoteError.set('');
    this.showQuoteForm.set(true);
    if (existing) {
      existing.items.forEach(i => (this.quoteForm.prices[i.productId] = i.quotedPrice));
    } else {
      const suggested = await this.purchase.quoteSuggestions(this.request().id, vendorId);
      Object.entries(suggested ?? {}).forEach(([pid, price]) => (this.quoteForm.prices[String(pid)] = Number(price)));
    }
  }

  onQuoteFile(event: Event): void {
    this.quoteFile = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.quoteFileName.set(this.quoteFile?.name ?? '');
    const dot = this.quoteFile ? this.quoteFile.name.lastIndexOf('.') : -1;
    this.quoteFileBase = this.quoteFile ? (dot > 0 ? this.quoteFile.name.slice(0, dot) : this.quoteFile.name) : '';
    this.quoteFileExt = this.quoteFile && dot > 0 ? this.quoteFile.name.slice(dot) : '';
  }

  /** % change of a price typed in the quotation form against the request price. */
  quoteDelta(productId: string): number {
    const req = this.requestPrice(productId);
    const v = this.quoteForm.prices[productId];
    return req > 0 && v !== null && v !== undefined && String(v) !== '' ? ((Number(v) - req) / req) * 100 : 0;
  }

  /** Short label of a price-list source. */
  sourceLabel(source?: string): string {
    return source === 'last quote' ? 'Last quote' : source === 'product price' ? 'Product price' : source ? 'Master price · to confirm' : '';
  }

  /** Line amount (incl. GST) of a product at the price typed in the quotation form. */
  quoteLineAmount(productId: string): number {
    const item = this.request().items.find(i => i.productId === productId);
    const price = Number(this.quoteForm.prices[productId]) || 0;
    return item ? price * item.requestedQty * (1 + item.gstPercent / 100) : 0;
  }

  quoteFormTotal(): number {
    return this.request().items.reduce((sum, i) => sum + this.quoteLineAmount(i.productId), 0);
  }

  /** Saves the vendor's quotation (one per vendor - a new one replaces the earlier) and selects it for approval. */
  async saveQuote(): Promise<void> {
    if (this.quoteSaving()) return;
    const vendorId = this.chosenVendorId();
    if (vendorId === null) return void this.quoteError.set('Choose the vendor first.');
    if (!this.quoteForm.quoteNo.trim()) return void this.quoteError.set("Enter the vendor's quote number.");
    const items = this.request().items;
    const missing = items.some(i => {
      const v = this.quoteForm.prices[i.productId];
      return v === null || v === undefined || String(v) === '' || Number(v) < 0;
    });
    if (missing) return void this.quoteError.set('Enter the vendor\'s price for every product.');
    if (this.quoteForm.validTill && this.quoteForm.validTill < this.quoteForm.quoteDate) return void this.quoteError.set('Valid till cannot be before the quote date.');
    if (!this.quoteFile) return void this.quoteError.set("Attach the vendor's proforma quote.");
    this.quoteError.set('');

    const body = new FormData();
    body.append('vendor_id', String(vendorId));
    body.append('quote_no', this.quoteForm.quoteNo.trim());
    body.append('quote_date', this.quoteForm.quoteDate);
    if (this.quoteForm.validTill) body.append('valid_till', this.quoteForm.validTill);
    if (this.quoteForm.remarks.trim()) body.append('remarks', this.quoteForm.remarks.trim());
    body.append('items', JSON.stringify(items.map(i => ({ product_id: Number(i.productId), quoted_price: Number(this.quoteForm.prices[i.productId]) }))));
    const base = this.quoteFileBase.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'vendor-quote';
    body.append('file', this.quoteFile, base + this.quoteFileExt);

    this.quoteSaving.set(true);
    const ok = await this.purchase.addRequestQuote(this.request().id, body);
    if (ok) {
      const { items: quotes } = await this.purchase.requestQuotes(this.request().id);
      this.quotes.set(quotes);
      const saved = this.usableQuotes().find(q => q.vendorId === vendorId);
      this.choice.set(saved ? `q:${saved.id}` : `v:${vendorId}`);
      this.showQuoteForm.set(false);
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

  /** Unit prices of a vendor's price list (its estimated quote), per product; empty = the server uses the product prices. */
  private estimatePrices(vendorId: number): Record<string, number> {
    const o = this.estimates().find(x => x.vendorId === vendorId);
    return o ? Object.fromEntries(o.lines.map(l => [l.productId, l.price])) : {};
  }

  /** Approving raises the purchase order for the chosen vendor: at its quote, its price list, or the product prices. */
  async approve(): Promise<void> {
    if (this.saving()) return;
    const c = this.choice();
    if (c === null) return void this.vendorError.set(true);
    this.saving.set(true);
    const order = await this.purchase.approveRequest(this.request().id, this.remarks.trim(), null,
      c.startsWith('q:') ? { quoteId: Number(c.slice(2)) } : { vendorId: Number(c.slice(2)), prices: this.estimatePrices(Number(c.slice(2))) });
    this.saving.set(false);
    if (order) this.dialogRef.close({ action: 'approved', order } satisfies ReviewResult);
  }

  async reject(): Promise<void> {
    if (!this.remarks.trim()) {
      this.remarksError.set(true);
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
