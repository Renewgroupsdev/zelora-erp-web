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
 * "Find a product at nearby branches": search a product and the branches / franchises holding it are listed (within 50 km of the
 * To Store first, nearest first). Picking one fills From Store and its earliest-expiry batch.
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

  // ---- nearby branches / franchises holding a product
  readonly productChoices = computed<SelectOption[]>(() => {
    const seen = new Map<string, SelectOption>();
    for (const b of this.purchase.stock()) {
      if (b.qty > 0 && !seen.has(b.productId)) seen.set(b.productId, { value: b.productId, label: `${b.productCode} - ${b.productName}` });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  });
  readonly findProductId = signal<string | null>(null);
  readonly nearby = signal<NearbyStoreOption[]>([]);
  readonly nearbyLoading = signal(false);
  readonly nearbyLoaded = signal(false);
  /** The nearby store currently chosen as the From Store, for the route card. */
  readonly picked = computed(() => this.nearby().find(o => o.storeKey === this.fromStoreKey()) ?? null);

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
