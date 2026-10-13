import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NavTabGroupService } from '../../../../services/nav-tab-group.service';
import { PurchaseService } from '../../../../shared/common-services/purchase.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { PURCHASE_TABS, allowedPurchaseTabs } from './purchase-tab-list';

/** Step strip shown on every Purchase Management page: Request -> PO -> Inward -> Return -> Notes -> Stock. */
@Component({
  selector: 'app-purchase-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="purchase-tabs" aria-label="Purchase management">
      @for (tab of tabs(); track tab.path; let i = $index) {
        <a class="tab" [routerLink]="tab.path" routerLinkActive="active">
          <span class="step">{{ i + 1 }}</span>
          <i class="bi" [class]="'bi ' + tab.icon"></i>
          <span class="label">{{ tab.label }}</span>
          @if (tab.badge) { <span class="badge" [class.warn]="tab.warn">{{ tab.badge }}</span> }
        </a>
        @if (i < tabs().length - 1) { <i class="bi bi-chevron-right sep" aria-hidden="true"></i> }
      }
    </nav>
  `,
  styles: [`
    .purchase-tabs { display: flex; align-items: center; gap: 4px; padding: 4px; overflow-x: auto; border: 1px solid var(--card-border); border-radius: 12px; background: var(--app-surface); scrollbar-width: none; }
    .tab { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 9px; color: var(--text-muted); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; transition: background .15s ease, color .15s ease; }
    .tab:hover { background: var(--primary-soft); color: var(--primary-dark); }
    .tab.active { background: linear-gradient(135deg, var(--primary-dark), var(--primary)); color: #fff; box-shadow: 0 6px 14px var(--primary-shadow); }
    .step { width: 17px; height: 17px; display: grid; place-items: center; border-radius: 50%; background: var(--primary-soft); color: var(--primary-dark); font-size: 10px; }
    .tab.active .step { background: rgba(255,255,255,.25); color: #fff; }
    .badge { min-width: 17px; height: 17px; padding: 0 5px; display: grid; place-items: center; border-radius: 99px; background: var(--status-orange-bg); color: var(--status-orange-text); font-size: 10px; }
    .badge.warn { background: var(--status-red-bg); color: var(--status-red-text); }
    .sep { color: var(--border-soft-strong); font-size: 10px; flex: 0 0 auto; }
    @media (max-width: 700px) { .label { display: none; } .tab.active .label { display: inline; } }
  `],
})
export class PurchaseTabs implements OnInit, OnDestroy {
  private readonly tabGroups = inject(NavTabGroupService);
  private unregister?: () => void;

  ngOnInit(): void {
    this.unregister = this.tabGroups.register(this.tabs().map(tab => tab.path));
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  private readonly purchase = inject(PurchaseService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Badge per tab path (pending work on that step). */
  private readonly badges = computed<Record<string, { badge: number; warn: boolean }>>(() => ({
    '/app/inventory/purchase-requests': { badge: this.purchase.pendingCount(), warn: false },
    '/app/inventory/purchase-orders': { badge: this.purchase.orders().filter(o => o.status !== 'Received').length, warn: false },
    '/app/inventory/vendor-notes': { badge: this.purchase.notes().filter(n => n.status === 'Open').length, warn: false },
    '/app/inventory/stock': { badge: this.purchase.lowStock().length, warn: true },
  }));

  /**
   * Only the tabs Roles & Permissions shows to the signed-in role (purchase-management -> "... Tab" actions),
   * each opening the URL set on its action. Badges stay keyed by the tab's own route.
   */
  readonly tabs = computed(() => allowedPurchaseTabs(this.auth, this.router).map(tab => {
    const route = PURCHASE_TABS.find(t => t.permission === tab.permission)!.path;
    return { ...tab, ...(this.badges()[route] ?? { badge: 0, warn: false }) };
  }));
}
