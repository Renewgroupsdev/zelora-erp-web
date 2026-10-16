import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ModuleTabs } from '../../shared/components/module-tabs/module-tabs';
import { WipPanel } from '../../shared/components/wip-panel/wip-panel';
import { OWN_TAB_STRIP_MODULES, findModuleTabsForPath } from '../../shared/utils/module-tabs.util';
import { PURCHASE_MODULE_SLUG } from '../inventory/purchase/purchase-tabs/purchase-tab-list';
import { PurchaseTabs } from '../inventory/purchase/purchase-tabs/purchase-tabs';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';

/**
 * Opened by a tab added on Roles & Permissions whose page has not been built yet (route: workInProgressMatch).
 * Shows inside the layout with the module's tab strip, so the new tab is visible and selectable while its page
 * is in progress. Once a real route for the URL exists, that page is opened instead.
 */
@Component({
  selector: 'app-work-in-progress',
  standalone: true,
  imports: [AutoModuleTabs, ModuleTabs, PurchaseTabs, WipPanel],
  templateUrl: './work-in-progress.html',
  styleUrl: '../../shared/styles/erp-page.scss',
})
export class WorkInProgress {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Current path without query - the component is reused when moving between two in-progress tabs. */
  private readonly path = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.currentPath())),
    { initialValue: this.currentPath() },
  );

  /** The module (and its tab, or the module itself) this URL belongs to. */
  readonly match = computed(() => findModuleTabsForPath(this.auth, this.path()));

  readonly isPurchase = computed(() => this.match()?.module.slug_name === PURCHASE_MODULE_SLUG);

  /**
   * Strip for modules whose pages draw their own (Purchase keeps its numbered step strip). Every other module's
   * tabs are already shown above this page by the layout (AutoModuleTabs).
   */
  readonly moduleTabs = computed(() => {
    const match = this.match();
    return match && !this.isPurchase() && OWN_TAB_STRIP_MODULES.includes(match.module.slug_name) ? match.tabs : [];
  });

  private currentPath(): string {
    return this.router.url.split(/[?#]/)[0];
  }
}
