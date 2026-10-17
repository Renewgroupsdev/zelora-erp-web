import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { RouteTab, allowedRouteTabs, moduleTabGuard } from '../../../../shared/utils/module-tabs.util';

/** One Purchase Management tab, built from a tab of the purchase-management module. */
export type PurchaseTab = RouteTab;

/** Roles & Permissions module whose tabs make up the Purchase Management strip. */
export const PURCHASE_MODULE_SLUG = 'purchase-management';

/** The Purchase Management tabs the signed-in role may see, from the permissions API (see module-tabs.util). */
export function allowedPurchaseTabs(auth: AuthService, router: Router): PurchaseTab[] {
  return allowedRouteTabs(auth, router, PURCHASE_MODULE_SLUG);
}

/** A Purchase Management tab the role may not see redirects to its first allowed tab (or the dashboard). */
export const purchaseTabGuard = moduleTabGuard(PURCHASE_MODULE_SLUG);
