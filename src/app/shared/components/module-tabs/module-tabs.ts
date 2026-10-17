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
  templateUrl: './module-tabs.html',
  styleUrl: './module-tabs.scss',
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

  /** Mouse wheel scrolls the strip sideways (only while it overflows, so the page scroll still works otherwise). */
  onWheel(event: WheelEvent, strip: HTMLElement): void {
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const max = strip.scrollWidth - strip.clientWidth;
    const next = Math.min(max, Math.max(0, strip.scrollLeft + event.deltaY));
    if (next === strip.scrollLeft) return; // already at an end: let the page scroll
    event.preventDefault();
    strip.scrollLeft = next;
  }

  /** Keeps the open tab visible when the strip scrolls sideways (narrow screens). */
  onActive(active: boolean, el: HTMLElement): void {
    if (active) setTimeout(() => el.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' }));
  }

  @Input() tabs: ModuleTab[] = [];
  @Input() label = 'Module pages';
}
