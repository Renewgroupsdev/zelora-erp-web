import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE_KEY, PurchaseOrder, VendorOption, VendorQuote, displayDate, lineTotals } from '../../../../../shared/models/purchase.model';
import { CanActionDirective } from '../../../../../shared/directives/can-action.directive';
import { SearchSelect, SelectOption } from '../../../../../shared/components/search-select/search-select';

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
  styleUrl: '../../../../../shared/styles/erp-dialog.scss',
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
    const [{ items }, estimates] = await Promise.all([this.purchase.requestQuotes(id), this.purchase.requestVendorOptions(id)]);
    this.quotes.set(items);
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
