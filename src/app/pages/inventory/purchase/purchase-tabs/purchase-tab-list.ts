import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { normalizeModulePath } from '../../../../shared/models/permission.model';
import { isAppRoute } from '../../../../shared/utils/app-route.util';

/** One Purchase Management tab and the Roles & Permissions action (module purchase-management) that shows it. */
export interface PurchaseTab {
  label: string;
  icon: string;
  path: string;
  permission: string;
}

/**
 * Request -> PO -> Inward -> Return -> Notes -> Stock, in step order. `path` is this app's route for the tab;
 * the label, icon and URL actually shown come from the tab's action (Action Name / Icon / URL in Roles &
 * Permissions) and fall back to the values here when those are left empty.
 */
export const PURCHASE_TABS: PurchaseTab[] = [
  { label: 'Purchase Requests', icon: 'bi-cart-plus', path: '/app/inventory/purchase-requests', permission: 'purchase-requests-tab' },
  { label: 'Purchase Orders', icon: 'bi-receipt', path: '/app/inventory/purchase-orders', permission: 'purchase-orders-tab' },
  { label: 'Purchase Inward', icon: 'bi-box-arrow-in-down', path: '/app/inventory/purchase-inward', permission: 'purchase-inward-tab' },
  { label: 'Purchase Return', icon: 'bi-box-arrow-up', path: '/app/inventory/purchase-returns', permission: 'purchase-returns-tab' },
  { label: 'Credit / Debit Notes', icon: 'bi-journal-text', path: '/app/inventory/vendor-notes', permission: 'vendor-notes-tab' },
  { label: 'Stock & Transfer', icon: 'bi-boxes', path: '/app/inventory/stock', permission: 'stock-transfer-tab' },
];

/**
 * The tabs the signed-in role may see, with the URL / icon / name set on their actions. A URL that is not a
 * page of this app (e.g. a typo saved in Roles & Permissions) is ignored, so the tab never opens a 404.
 */
export function allowedPurchaseTabs(auth: AuthService, router: Router): PurchaseTab[] {
  return PURCHASE_TABS.flatMap(tab => {
    const action = auth.actionDetails(tab.permission);
    if (!action) return [];
    const url = normalizeModulePath(action.url);
    return [{
      ...tab,
      path: url && isAppRoute(router.config, url) ? url : tab.path,
      icon: action.logo || tab.icon,
      label: action.action_name?.replace(/\s+tab$/i, '').trim() || tab.label,
    }];
  });
}

/**
 * Route guard for the Purchase Management tabs: a tab the role may not see sends the user to the first tab
 * it may see (the sidebar link always points at Purchase Requests), or to the dashboard when there is none.
 */
export const purchaseTabGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // pathFromRoot already holds the 'app' layout segment: ['app', 'inventory', 'purchase-requests'].
  const path = '/' + route.pathFromRoot.flatMap(r => r.url.map(s => s.path)).join('/');
  const tab = PURCHASE_TABS.find(t => t.path === path);

  if (!tab || auth.hasActionAccess(tab.permission)) return true;

  return router.parseUrl(allowedPurchaseTabs(auth, router)[0]?.path ?? '/app/dashboard');
};
