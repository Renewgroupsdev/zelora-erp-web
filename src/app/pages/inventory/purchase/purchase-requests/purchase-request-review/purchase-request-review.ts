import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE_KEY, PurchaseOrder, VendorOption, VendorQuote, displayDate, lineTotals } from '../../../../../shared/models/purchase.model';
import { CanActionDirective } from '../../../../../shared/directives/can-action.directive';
import { RecordHistory } from '../../../../../shared/components/record-history/record-history';

export interface ReviewResult {
  action: 'approved' | 'rejected';
  order?: PurchaseOrder;
}

/**
 * Head-office view of a purchase request: details, the vendors' proforma quotes (the least one is flagged), approve with the chosen
 * quote (-> PO for that vendor + invoice sent to it by e-mail / WhatsApp) or reject.
 */
@Component({
  selector: 'app-purchase-request-review',
  standalone: true,
  imports: [CanActionDirective, CommonModule, FormsModule, MatDialogModule, RecordHistory],
  templateUrl: './purchase-request-review.html',
  styleUrl: '../../../../../shared/styles/erp-dialog.scss',
})
export class PurchaseRequestReview {
  private readonly dialogRef = inject(MatDialogRef<PurchaseRequestReview, ReviewResult>);
  private readonly data = inject<{ requestId: string }>(MAT_DIALOG_DATA);
  readonly purchase = inject(PurchaseService);

  readonly request = computed(() => this.purchase.requests().find(r => r.id === this.data.requestId)!);
  readonly totals = computed(() => lineTotals(this.request().items));
  readonly canReview = computed(() => this.request().status === 'Pending' && this.purchase.canApproveRequests());
  readonly displayDate = displayDate;

  // ---- vendor proforma quotes
  /** Only the vendors of the requested products, cheapest estimate first. */
  readonly vendorOptions = signal<VendorOption[]>([]);
  readonly quotes = signal<VendorQuote[]>([]);
  readonly canManageQuotes = signal(false);
  readonly selectedQuoteId = signal<number | null>(null);
  readonly showQuoteForm = signal(false);
  readonly quoteSaving = signal(false);
  readonly quoteFileName = signal('');
  readonly quoteError = signal('');
  private quoteFile: File | null = null;
  quote = { vendorId: null as number | null, quoteNo: '', quoteDate: new Date().toISOString().slice(0, 10), validTill: '', remarks: '', prices: {} as Record<string, number | null> };
  readonly selectedQuote = computed(() => this.quotes().find(q => q.id === this.selectedQuoteId()) ?? null);
  /** Approval needs a complete, unexpired quote chosen. */
  /** The vendor picked in the price-list dropdown (it still has to be saved as a quote before approving). */
  readonly vendorChoice = signal<number | null>(null);
  /** Approval needs a saved, complete, unexpired quote chosen. */
  readonly canApproveNow = computed(() => { const q = this.selectedQuote(); return !!q && q.complete && !q.expired; });

  remarks = '';
  expectedAt: string | null = null;
  readonly remarksError = signal(false);
  readonly saving = signal(false);
  readonly today = new Date().toISOString().slice(0, 10);

  constructor() {
    // On-hand qty shown per line; stock is not part of the Purchase Requests tab load.
    void this.purchase.reload('stock');
    void this.loadQuotes();
    void this.purchase.requestVendorOptions(this.request().id).then(o => this.vendorOptions.set(o));
  }

  async loadQuotes(): Promise<void> {
    const res = await this.purchase.requestQuotes(this.request().id);
    this.quotes.set(res.items);
    this.canManageQuotes.set(res.canManage);
    // the least quote is pre-selected; an approved request shows the quote it was approved with
    const chosen = res.items.find(q => q.status === 'Selected') ?? res.items.find(q => q.lowest);
    if (!this.selectedQuoteId() || !res.items.some(q => q.id === this.selectedQuoteId())) this.selectedQuoteId.set(chosen?.id ?? null);
  }

  /**
   * Choosing a vendor loads its price for every requested product (last quote, else the product price) into an editable price list.
   * Approving still needs a saved proforma quote, so a plain vendor choice does not enable the approve button.
   */
  onQuoteVendor(vendorId: number | null): void {
    this.quote.vendorId = vendorId;
    this.vendorChoice.set(vendorId);
    this.quoteError.set('');
    if (!vendorId) return;
    this.selectedQuoteId.set(null);
    const option = this.vendorOptions().find(v => v.vendorId === vendorId);
    this.quote.prices = Object.fromEntries((option?.lines ?? []).map(l => [l.productId, l.price]));
  }

  /** Selecting a saved quote clears the plain vendor choice. */
  pickQuote(id: number): void {
    this.selectedQuoteId.set(id);
    this.vendorChoice.set(null);
    this.quote.vendorId = null;
  }

  price(productId: string): number {
    return Number(this.quote.prices[productId]) || 0;
  }

  lineAmount(item: { productId: string; requestedQty: number; gstPercent: number }): number {
    return this.price(item.productId) * item.requestedQty * (1 + item.gstPercent / 100);
  }

  /** Total of the price list on screen. */
  priceTotal(): number {
    return this.request().items.reduce((sum, i) => sum + this.lineAmount(i), 0);
  }

  /** The vendor picked in the price list (not yet a saved quote). */
  chosenVendor(): VendorOption | null {
    return this.vendorOptions().find(x => x.vendorId === this.vendorChoice()) ?? null;
  }

  /** Editable name of the picked proforma (without the extension); the file is uploaded under this name. */
  quoteFileBase = '';
  quoteFileExt = '';

  onQuoteFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.quoteFile = file;
    this.quoteFileName.set(file?.name ?? '');
    const dot = file ? file.name.lastIndexOf('.') : -1;
    this.quoteFileBase = file ? (dot > 0 ? file.name.slice(0, dot) : file.name) : '';
    this.quoteFileExt = file && dot > 0 ? file.name.slice(dot) : '';
  }

  /** The name to upload under: the edited one, cleaned of characters a file name cannot hold. */
  private uploadName(): string {
    const base = this.quoteFileBase.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'proforma';
    return base + this.quoteFileExt;
  }

  async saveQuote(): Promise<void> {
    const q = this.quote;
    if (!q.vendorId) return void this.quoteError.set('Select the vendor.');
    if (!q.quoteNo.trim()) return void this.quoteError.set("Enter the vendor's quote number.");
    if (!this.quoteFile) return void this.quoteError.set("Attach the vendor's proforma quote.");
    const items = this.request().items.map(i => ({ product_id: Number(i.productId), quoted_price: q.prices[i.productId] }));
    if (items.some(i => i.quoted_price === null || i.quoted_price === undefined || String(i.quoted_price) === '' || Number(i.quoted_price) < 0)) return void this.quoteError.set('Enter the quoted price of every product.');
    this.quoteError.set('');

    const form = new FormData();
    form.append('vendor_id', String(q.vendorId));
    form.append('quote_no', q.quoteNo.trim());
    form.append('quote_date', q.quoteDate);
    if (q.validTill) form.append('valid_till', q.validTill);
    if (q.remarks.trim()) form.append('remarks', q.remarks.trim());
    form.append('items', JSON.stringify(items));
    form.append('file', this.quoteFile, this.uploadName());
    this.quoteSaving.set(true);
    const ok = await this.purchase.addRequestQuote(this.request().id, form);
    this.quoteSaving.set(false);
    if (!ok) return;
    const vendorId = this.vendorChoice();
    this.selectedQuoteId.set(null);
    await this.loadQuotes();
    const saved = this.quotes().find(x => x.vendorId === vendorId);
    if (saved) this.pickQuote(saved.id); // the saved proforma replaces the plain vendor choice
  }

  async removeQuote(q: VendorQuote): Promise<void> {
    if (!(await this.purchase.removeRequestQuote(this.request().id, q.id))) return;
    if (this.selectedQuoteId() === q.id) this.selectedQuoteId.set(null);
    await this.loadQuotes();
  }

  viewQuote(q: VendorQuote): void {
    this.purchase.openProforma(`request-quotes/${q.id}/file`);
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

  async approve(): Promise<void> {
    if (this.saving() || !this.canApproveNow()) return;
    this.saving.set(true);
    const order = await this.purchase.approveRequest(this.request().id, this.remarks.trim(), this.expectedAt, { quoteId: this.selectedQuoteId()! });
    this.saving.set(false);
    if (order) this.dialogRef.close({ action: 'approved', order });
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
