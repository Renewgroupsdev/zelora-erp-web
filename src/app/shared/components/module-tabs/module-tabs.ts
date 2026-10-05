import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavTabGroupService } from '../../../services/nav-tab-group.service';

export interface ModuleTab {
  label: string;
  icon: string;
  path: string;
  /** Count bubble (hidden at 0). */
  badge?: number;
  /** Red bubble instead of orange. */
  warn?: boolean;
}

/** Horizontal page switcher for a module's sub pages (HR, Accounts). */
@Component({
  selector: 'app-module-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="module-tabs" [attr.aria-label]="label">
      @for (tab of tabs; track tab.path) {
        <a class="tab" [routerLink]="tab.path" routerLinkActive="active">
          <i [class]="'bi ' + tab.icon"></i>
          <span class="label">{{ tab.label }}</span>
          @if (tab.badge) { <span class="badge" [class.warn]="tab.warn">{{ tab.badge }}</span> }
        </a>
      }
    </nav>
  `,
  styles: [`
    .module-tabs { display: flex; align-items: center; gap: 4px; padding: 4px; overflow-x: auto; border: 1px solid var(--card-border); border-radius: 12px; background: var(--app-surface); scrollbar-width: none; }
    .tab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 9px; color: var(--text-muted); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; transition: background .15s ease, color .15s ease; }
    .tab:hover { background: var(--primary-soft); color: var(--primary-dark); }
    .tab.active { background: linear-gradient(135deg, var(--primary-dark), var(--primary)); color: #fff; box-shadow: 0 6px 14px var(--primary-shadow); }
    .badge { min-width: 17px; height: 17px; padding: 0 5px; display: grid; place-items: center; border-radius: 99px; background: var(--status-orange-bg); color: var(--status-orange-text); font-size: 10px; }
    .badge.warn { background: var(--status-red-bg); color: var(--status-red-text); }
    @media (max-width: 700px) { .label { display: none; } .tab.active .label { display: inline; } }
  `],
})
export class ModuleTabs implements OnInit, OnDestroy {
  private readonly tabGroups = inject(NavTabGroupService);
  private unregister?: () => void;

  ngOnInit(): void {
    this.unregister = this.tabGroups.register(this.tabs.map(tab => tab.path));
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  @Input() tabs: ModuleTab[] = [];
  @Input() label = 'Module pages';
}
