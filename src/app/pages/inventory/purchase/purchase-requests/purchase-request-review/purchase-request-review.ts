import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE_KEY, NearbyStockItem, NearbyStoreOption, PurchaseOrder, displayDate, lineTotals } from '../../../../../shared/models/purchase.model';
import { CanActionDirective } from '../../../../../shared/directives/can-action.directive';

export interface ReviewResult {
  action: 'approved' | 'rejected';
  order?: PurchaseOrder;
}

/**
 * Head-office view of a purchase request: details, the nearby branches / franchises holding each product, approve (= transfer the
 * stock from the chosen branch to the requesting branch) or reject.
 */
@Component({
  selector: 'app-purchase-request-review',
  standalone: true,
  imports: [CanActionDirective, CommonModule, FormsModule, MatDialogModule],
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

  // ---- nearby branch / franchise stock: the sending branch per product; approving performs the transfer
  readonly nearby = signal<NearbyStockItem[]>([]);
  readonly nearbyLoaded = signal(false);
  readonly nearbyError = signal('');
  /** productId -> chosen sending store key. */
  readonly sourceKey = signal<Record<string, string | null>>({});
  /** Approval needs every requested product to have a nearby branch with enough stock chosen. */
  readonly canApproveNow = computed(() => {
    const items = this.nearby();
    return items.length > 0 && items.every(i => {
      const key = this.sourceKey()[i.productId];
      return !!key && (i.options.find(o => o.storeKey === key)?.available ?? 0) >= i.needed;
    });
  });

  constructor() {
    // On-hand qty shown per line; stock is not part of the Purchase Requests tab load.
    void this.purchase.reload('stock');
    void this.loadNearby();
  }

  async loadNearby(): Promise<void> {
    if (!this.canReview()) return;
    const items = await this.purchase.nearbyStock(this.request().id);
    this.nearby.set(items);
    const pick: Record<string, string | null> = {};
    for (const i of items) {
      const enough = i.options.filter(o => o.available >= i.needed);
      // the nearest store with enough stock is pre-selected (options come nearest first)
      pick[i.productId] = enough[0]?.storeKey ?? null;
    }
    this.sourceKey.set(pick);
    this.nearbyLoaded.set(true);
  }

  /** Stores of one zone, nearest first (the dropdown groups: within 50 km / farther / distance unknown). */
  zone(item: NearbyStockItem, zone: NearbyStoreOption['zone']): NearbyStoreOption[] {
    return item.options.filter(o => o.zone === zone);
  }

  /** The store picked for a product, for the summary card under its dropdown. */
  picked(item: NearbyStockItem): NearbyStoreOption | null {
    return item.options.find(o => o.storeKey === this.sourceKey()[item.productId]) ?? null;
  }

  /** 12.4 -> "12.4 km"; null -> "distance not set". */
  km(o: NearbyStoreOption): string {
    return o.distanceKm === null ? 'distance not set' : `${o.distanceKm} km`;
  }

  onSource(productId: string, key: string | null): void {
    this.nearbyError.set('');
    this.sourceKey.set({ ...this.sourceKey(), [productId]: key });
  }

  /** "Peeling Solution x2 from Renew Chennai, ..." for the confirmation line. */
  transferSummary(): string {
    return this.nearby().map(i => {
      const o = i.options.find(x => x.storeKey === this.sourceKey()[i.productId]);
      return o ? `${i.productName} x${i.needed} from ${o.name}` : '';
    }).filter(Boolean).join(', ');
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

  /** Approving = the stock transfer: each product moves from the chosen branch / franchise to the requesting branch. */
  async approve(): Promise<void> {
    if (this.saving()) return;
    if (!this.canApproveNow()) return void this.nearbyError.set('Choose a nearby branch with enough stock for every product.');
    const transfers = this.nearby().map(i => ({ storeKey: this.sourceKey()[i.productId]!, productId: i.productId, qty: i.needed }));
    this.saving.set(true);
    const result = await this.purchase.fulfilFromStock(this.request().id, transfers, this.remarks.trim());
    this.saving.set(false);
    if (result?.approved) this.dialogRef.close({ action: 'approved' });
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
