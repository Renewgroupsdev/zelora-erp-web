import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE_KEY, NearbyStoreOption, StockBatch, displayDate } from '../../../../../shared/models/purchase.model';
import { PageLoader } from '../../../../../shared/components/page-loader/page-loader';
import { SearchSelect, SelectOption } from '../../../../../shared/components/search-select/search-select';

interface TransferRow {
  batchId: string | null;
  qty: number | null;
}

/**
 * Dispatch stock to another store (reference stock transfer / stock return): one or more batches leave the source
 * now and stay "In Transit" until the receiving store accepts or rejects them.
 *
 * "Nearby stores": for the product being transferred (the stock row it was opened from, else the batch picked in the table)
 * the branches / franchises holding it load into a dropdown (within 50 km of the To Store first, nearest first). Picking one
 * fills From Store and its earliest-expiry batch.
 */
@Component({
  selector: 'app-stock-transfer-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, PageLoader, SearchSelect],
  templateUrl: './stock-transfer-form.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', '../../goods-inward/goods-inward-form/goods-inward-form.scss'],
})
export class StockTransferForm {
  private readonly dialogRef = inject(MatDialogRef<StockTransferForm>);
  private readonly data = inject<{ batchId?: string } | null>(MAT_DIALOG_DATA, { optional: true });
  readonly purchase = inject(PurchaseService);
  readonly displayDate = displayDate;

  private readonly startBatch = this.purchase.stock().find(b => b.id === this.data?.batchId) ?? null;
  readonly fromStoreKey = signal<string>(this.startBatch?.storeKey ?? CENTRAL_STORE_KEY);
  readonly rows = signal<TransferRow[]>([{ batchId: this.startBatch?.id ?? null, qty: null }]);
  readonly submitted = signal(false);
  readonly saving = signal(false);
  remarks = '';

  /** Earliest expiry first, so the batch that should go out first is on top. */
  readonly batches = computed(() => this.purchase.availableBatches(this.fromStoreKey()));
  readonly targets = computed(() => this.purchase.storeOptions().filter(s => s.key !== this.fromStoreKey()));
  toStoreKey: string = this.defaultTarget();

  readonly kind = computed(() => (this.toStoreKeySignal() === CENTRAL_STORE_KEY ? 'Stock Return to Central Store' : 'Stock Transfer'));
  private readonly toStoreKeySignal = signal<string>(this.toStoreKey);

  private defaultTarget(): string {
    const others = this.purchase.storeOptions().filter(s => s.key !== this.fromStoreKey());
    return others[0]?.key ?? CENTRAL_STORE_KEY;
  }

  // ---- nearby branches / franchises holding the product being transferred (no product search: it is the row's product)
  readonly findProductId = signal<string | null>(null);
  /** Opened from a stock row: the product is that row's, so no product search is shown. */
  readonly fromRow = !!this.startBatch;
  /** Every product held in any store (searchable), for the "Transfer Stock" button case. */
  readonly productChoices = computed<SelectOption[]>(() => {
    const seen = new Map<string, SelectOption>();
    for (const b of this.purchase.stock()) {
      if (b.qty > 0 && !seen.has(b.productId)) seen.set(b.productId, { value: b.productId, label: b.productName, hint: b.productCode });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  });
  /** "PRD-0002 - GFC Kit" of the product the nearby list is for. */
  readonly findProductLabel = computed(() => {
    const b = this.purchase.stock().find(x => x.productId === this.findProductId());
    return b ? `${b.productCode} - ${b.productName}` : '';
  });
  /** Nearby stores as dropdown options: nearest first, grouped by distance zone. */
  readonly nearbyChoices = computed<SelectOption[]>(() => this.nearby().map(o => ({
    value: o.storeKey,
    label: o.city && o.city !== o.name ? `${o.name} · ${o.city}` : o.name,
    hint: `${this.km(o)} · ${o.available} in stock`,
    group: this.zoneLabel(o),
  })));
  readonly nearby = signal<NearbyStoreOption[]>([]);
  readonly nearbyLoading = signal(false);
  readonly nearbyLoaded = signal(false);
  /** The nearby store currently chosen as the From Store, for the route card. */
  readonly picked = computed(() => this.nearby().find(o => o.storeKey === this.fromStoreKey()) ?? null);

  constructor() {
    // opened from a stock row: load the stores near the To Store that hold this product straight away
    if (this.startBatch) void this.findNearby(this.startBatch.productId);
  }

  async findNearby(productId: string | null): Promise<void> {
    this.findProductId.set(productId);
    this.nearby.set([]);
    this.nearbyLoaded.set(false);
    if (!productId) return;
    this.nearbyLoading.set(true);
    const list = await this.purchase.nearbyStores(productId, this.toStoreKey);
    if (productId !== this.findProductId()) return; // another product was picked while loading
    this.nearby.set(list);
    this.nearbyLoading.set(false);
    this.nearbyLoaded.set(true);
  }

  /** Nearby dropdown picked a store: use it as the sender. */
  pickNearby(storeKey: string | null): void {
    const o = this.nearby().find(x => x.storeKey === storeKey);
    if (o) this.useSource(o);
  }

  /** Products with a batch still free for this row (the product dropdown lists names only). */
  productOptions(index: number): { productId: string; productName: string }[] {
    const seen = new Map<string, string>();
    for (const b of this.options(index)) if (!seen.has(b.productId)) seen.set(b.productId, b.productName);
    return [...seen].map(([productId, productName]) => ({ productId, productName }));
  }

  /**
   * A product was picked: the row takes its earliest-expiry batch that no other row uses (batches() is earliest expiry first),
   * and the product drives the nearby-stores dropdown.
   */
  pickProduct(index: number, productId: string | null): void {
    const row = this.rows()[index];
    if (!row) return;
    row.batchId = productId ? this.options(index).find(b => b.productId === productId)?.id ?? null : null;
    row.qty = row.batchId ? row.qty : null;
    this.touch();
    if (productId && productId !== this.findProductId()) void this.findNearby(productId);
  }

  /** − / + buttons of the transfer qty (0 .. available in the batch). */
  stepQty(row: TransferRow, by: number): void {
    const max = this.batch(row)?.qty ?? 0;
    const next = Math.min(max, Math.max(0, (Number(row.qty) || 0) + by));
    row.qty = next || null;
    this.touch();
  }

  /** Use a nearby store as the sender: From Store + the product's earliest-expiry batch there. */
  useSource(o: NearbyStoreOption): void {
    this.setFrom(o.storeKey);
    const batch = this.purchase.availableBatches(o.storeKey).find(b => b.productId === this.findProductId());
    this.rows.set([{ batchId: batch?.id ?? null, qty: null }]);
  }

  km(o: NearbyStoreOption): string {
    return o.distanceKm === null ? 'distance not set' : `${o.distanceKm} km`;
  }

  zoneLabel(o: NearbyStoreOption): string {
    return o.zone === 'near' ? 'Within 50 km' : o.zone === 'far' ? 'Beyond 50 km' : 'Distance unknown';
  }

  setFrom(storeKey: string): void {
    this.fromStoreKey.set(storeKey);
    this.rows.set([{ batchId: null, qty: null }]);
    if (this.toStoreKey === storeKey) this.setTo(this.defaultTarget());
  }

  setTo(storeKey: string): void {
    this.toStoreKey = storeKey;
    this.toStoreKeySignal.set(storeKey);
    if (this.findProductId()) void this.findNearby(this.findProductId()); // distances are measured from the To Store
  }

  batch(row: TransferRow): StockBatch | null {
    return this.batches().find(b => b.id === row.batchId) ?? null;
  }

  /** Batches not already picked on another row ("Product with same batchno already available in the list"). */
  options(index: number): StockBatch[] {
    const taken = new Set(this.rows().filter((_, i) => i !== index).map(r => r.batchId));
    return this.batches().filter(b => !taken.has(b.id));
  }

  touch(): void {
    this.rows.update(list => [...list]);
  }

  rowError(row: TransferRow): string | null {
    const b = this.batch(row);
    if (!b) return 'Select batch no.';
    const q = Number(row.qty);
    if (!row.qty || q <= 0) return 'Transfer qty required.';
    if (!Number.isInteger(q)) return 'Qty must be a whole number.';
    if (q > b.qty) return `Transfer qty should not be greater than the ${b.qty} available.`;
    return null;
  }

  readonly totalQty = computed(() => this.rows().reduce((s, r) => s + (Number(r.qty) || 0), 0));

  /** Source store total for a product after this transfer (all rows of that product). */
  sourceAfter(row: TransferRow): number {
    const b = this.batch(row);
    if (!b) return 0;
    const out = this.rows().filter(r => this.batch(r)?.productId === b.productId).reduce((s, r) => s + (Number(r.qty) || 0), 0);
    return this.purchase.storeQtyByKey(this.fromStoreKey(), b.productId) - out;
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    if (this.toStoreKey === this.fromStoreKey() || this.rows().some(r => this.rowError(r)) || this.saving()) return;

    this.saving.set(true);
    const transfer = await this.purchase.dispatchTransfer({
      fromStoreKey: this.fromStoreKey(),
      toStoreKey: this.toStoreKey,
      remarks: this.remarks.trim(),
      lines: this.rows().map(r => ({ batchId: r.batchId!, qty: Number(r.qty) })),
    });
    this.saving.set(false);
    if (transfer) this.dialogRef.close(transfer);
  }

  close(): void {
    this.dialogRef.close();
  }
}
