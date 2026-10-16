import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { OWN_TAB_STRIP_MODULES, findModuleTabsForPath } from '../../utils/module-tabs.util';
import { ModuleTabs } from './module-tabs';

/**
 * Tab strip shown under the page title of any page whose module has page tabs on Roles & Permissions (Treatment
 * Management, a new module ...), so a tab added there appears on its pages. Place it right after the page's
 * .page-header. Modules whose pages draw their own strip (OWN_TAB_STRIP_MODULES) are skipped.
 */
@Component({
  selector: 'app-auto-module-tabs',
  standalone: true,
  imports: [ModuleTabs],
  template: `
    <!-- keyed by module so the strip re-registers its pages when moving to another module -->
    @for (m of matches(); track m.module.slug_name) {
      <div class="auto-module-tabs">
        <app-module-tabs [tabs]="m.tabs" [label]="m.module.module_name + ' pages'"></app-module-tabs>
      </div>
    }
  `,
  styles: [`
    :host { display: block; flex: 0 0 auto; }
  `],
})
export class AutoModuleTabs {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  private readonly path = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.currentPath())),
    { initialValue: this.currentPath() },
  );

  readonly matches = computed(() => {
    const match = findModuleTabsForPath(this.auth, this.path());
    if (!match || !match.tabs.length || OWN_TAB_STRIP_MODULES.includes(match.module.slug_name)) return [];
    return [match];
  });

  private currentPath(): string {
    return this.router.url.split(/[?#]/)[0];
  }
}
