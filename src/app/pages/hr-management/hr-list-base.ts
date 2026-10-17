import { Directive, Signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HrService } from '../../shared/common-services/hr.service';
import { LocalListBase } from '../../shared/components/local-list-base';
import { ModuleTab } from '../../shared/components/module-tabs/module-tabs';
import { allowedRouteTabs } from '../../shared/utils/module-tabs.util';
import { HR_MODULE_SLUG } from './hr-tab-list';

/**
 * HR sub-page tabs: the hr-management tabs the role has, from the permissions API (name / icon / URL / order
 * as set on Roles & Permissions), with live pending counts. Call in an injection context (a field initializer).
 */
export function injectHrTabs(): Signal<ModuleTab[]> {
  const hr = inject(HrService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return computed(() => {
    // Badge per page (pending work there) - shown when a tab's URL is that page.
    const badges: Record<string, number> = {
      '/app/hr/leave-permission': hr.pendingLeaves(),
      '/app/hr/recruitment': hr.pendingManpower(),
      '/app/hr/appraisals': hr.appraisals().filter(a => a.status === 'Draft').length,
      '/app/hr/onboarding-exit': hr.exits().filter(x => x.status !== 'Settled').length,
    };
    return allowedRouteTabs(auth, router, HR_MODULE_SLUG).map(tab => ({
      label: tab.label,
      icon: tab.icon,
      path: tab.path,
      badge: badges[tab.path] ?? 0,
    }));
  });
}

/** HR list pages: `source` filter = department, `branch` filter = branch. */
@Directive()
export abstract class HrListBase extends LocalListBase {
  protected readonly hr = inject(HrService);
  protected override filterFields = { status: 'status', source: 'department', branch: ['branch'] };

  readonly tabs = injectHrTabs();

  private readonly actionAuth = inject(AuthService);

  /** Whether Roles & Permissions ticks the signed-in role on this HR action slug. */
  can(slug: string): boolean {
    return this.actionAuth.hasActionAccess(slug);
  }
}
