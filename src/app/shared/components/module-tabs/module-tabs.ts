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

/**
 * Step strip for a module's sub pages (Purchase, HR, Accounts and every module's Roles & Permissions tabs):
 * numbered chevron segments, the open page's segment filled in the brand colour.
 */
@Component({
  selector: 'app-module-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="module-tabs" [attr.aria-label]="label">
      @for (tab of tabs; track tab.path; let i = $index) {
        <a class="tab" [routerLink]="tab.path" routerLinkActive="active" #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">
          <span class="step">{{ i + 1 }}</span>
          <i [class]="'bi ' + tab.icon"></i>
          <span class="label">{{ tab.label }}</span>
          @if (tab.badge) { <span class="badge" [class.warn]="tab.warn">{{ tab.badge }}</span> }
        </a>
      }
    </nav>
  `,
  styles: [`
    :host { display: block; min-width: 0; }

    .module-tabs {
      --arrow: 14px;
      display: flex;
      align-items: stretch;
      padding: 5px;
      overflow-x: auto;
      border: 1px solid var(--card-border);
      border-radius: 14px;
      background: var(--app-surface-solid, var(--app-surface));
      box-shadow: 0 4px 14px color-mix(in srgb, var(--primary) 6%, transparent);
      scrollbar-width: none;
    }

    .module-tabs::-webkit-scrollbar { display: none; }

    /* Each segment is an arrow: notched on the left, pointed on the right. Overlapping by the arrow width
       minus 3px leaves a thin white chevron gap between neighbours. */
    .tab {
      position: relative;
      flex: 1 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 42px;
      padding: 0 calc(var(--arrow) + 12px) 0 calc(var(--arrow) + 14px);
      margin-left: calc(var(--arrow) * -1 + 3px);
      background: color-mix(in srgb, var(--primary) 7%, var(--app-surface-solid, #fff));
      color: var(--text-dark);
      font-size: 12.5px;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      clip-path: polygon(0 0, calc(100% - var(--arrow)) 0, 100% 50%, calc(100% - var(--arrow)) 100%, 0 100%, var(--arrow) 50%);
      transition: background 0.2s ease, color 0.2s ease;
    }

    .tab:first-child {
      margin-left: 0;
      padding-left: 16px;
      border-radius: 10px 0 0 10px;
      clip-path: polygon(0 0, calc(100% - var(--arrow)) 0, 100% 50%, calc(100% - var(--arrow)) 100%, 0 100%);
    }

    .tab:hover {
      background: color-mix(in srgb, var(--primary) 14%, var(--app-surface-solid, #fff));
      color: var(--primary-dark);
    }

    .tab:focus-visible {
      outline: none;
      background: color-mix(in srgb, var(--primary) 18%, var(--app-surface-solid, #fff));
    }

    .tab i { font-size: 15px; color: var(--primary-dark); transition: color 0.2s ease; }

    .step {
      flex: 0 0 auto;
      width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      border: 1.5px solid color-mix(in srgb, var(--primary) 22%, transparent);
      background: var(--app-surface-solid, #fff);
      color: var(--primary-dark);
      font-size: 10.5px;
      font-weight: 700;
      transition: all 0.2s ease;
    }

    .tab.active {
      background: linear-gradient(135deg, var(--primary-dark), var(--primary));
      color: #fff;
    }

    .tab.active i { color: #fff; }

    .tab.active .step {
      background: transparent;
      border-color: rgba(255, 255, 255, 0.75);
      color: #fff;
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
    }

    /* soft light sweep across the open step */
    .tab.active::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.16) 50%, transparent 70%);
      background-size: 250% 100%;
      animation: tab-sheen 4s ease-in-out infinite;
      pointer-events: none;
    }

    .badge {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      display: grid;
      place-items: center;
      border-radius: 99px;
      background: var(--status-orange-bg);
      color: var(--status-orange-text);
      font-size: 10px;
      font-weight: 700;
    }

    .badge.warn { background: var(--status-red-bg); color: var(--status-red-text); }
    .tab.active .badge { background: #fff; }

    @keyframes tab-sheen {
      0%, 100% { background-position: 120% 0; }
      50% { background-position: -20% 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .tab.active::after { animation: none; }
    }

    @media (max-width: 700px) {
      .module-tabs { --arrow: 11px; }
      .tab { min-height: 38px; gap: 6px; font-size: 12px; }
      .label { display: none; }
      .tab.active .label { display: inline; }
    }
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
