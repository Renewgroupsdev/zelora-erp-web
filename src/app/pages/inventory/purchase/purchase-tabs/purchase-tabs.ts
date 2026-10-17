import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../../../../shared/common-services/purchase.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { ModuleTabs } from '../../../../shared/components/module-tabs/module-tabs';
import { allowedPurchaseTabs } from './purchase-tab-list';

/**
 * Step strip shown on every Purchase Management page (Request -> PO -> Inward -> Return -> Stock ...),
 * drawn by the shared ModuleTabs strip with Purchase's pending-work badges.
 */
@Component({
  selector: 'app-purchase-tabs',
  standalone: true,
  imports: [ModuleTabs],
  templateUrl: './purchase-tabs.html',
})
export class PurchaseTabs {
  // Data is loaded by each tab page itself (PurchaseListBase), so only the open tab's API is called.
  private readonly purchase = inject(PurchaseService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Badge per tab path (pending work on that step). */
  private readonly badges = computed<Record<string, { badge: number; warn: boolean }>>(() => ({
    '/app/inventory/purchase-requests': { badge: this.purchase.pendingCount(), warn: false },
    '/app/inventory/purchase-orders': { badge: this.purchase.orders().filter(o => o.canInward).length, warn: false },
    // Transfers waiting for the receiving store, else low-stock lines.
    '/app/inventory/stock': this.purchase.openTransfers().length
      ? { badge: this.purchase.openTransfers().length, warn: false }
      : { badge: this.purchase.lowStock().length, warn: true },
  }));

  /**
   * Loaded from the permissions API (purchase-management -> tabs the role has), each opening
   * the URL set on it. A badge shows when that URL is one of the pages above.
   */
  readonly tabs = computed(() => allowedPurchaseTabs(this.auth, this.router).map(tab => ({
    ...tab,
    ...(this.badges()[tab.path] ?? { badge: 0, warn: false }),
  })));
}
