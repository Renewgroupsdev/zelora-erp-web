import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavTabGroupService } from '../services/nav-tab-group.service';
import { NavLayoutService } from '../services/nav-layout.service';
import { AuthService } from '../core/auth/auth.service';
import { SidebarModule, normalizeModulePath } from '../shared/models/permission.model';

interface NavLink {
  label: string;
  icon: string;
  path: string;
  children?: NavLink[];
  groupOnly?: boolean;
}

@Component({
  selector: 'app-left-side-navbar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './left-side-navbar.html',
  styleUrl: './left-side-navbar.scss',
})
export class LeftSideNavbar {

  readonly expandedParent = signal<string | null>(null);
  readonly openHorizontalSubmenu = signal<string | null>(null);
  readonly openCompactSubmenu = signal<string | null>(null);
  private readonly auth = inject(AuthService);

  
  private readonly DEFAULT_ICON = 'bi-dot';

  readonly navLinks = computed<NavLink[]>(() => {
    const menus = this.auth.menus();
    return menus.length ? menus.map(menu => this.toNavLink(menu)) : [];
  });

  private toNavLink(menu: SidebarModule): NavLink {
    const children = (menu.sub_modules ?? []).map(sub => this.toNavLink(sub));

    return {
      label: menu.module_name,
      icon:  menu.icon || this.DEFAULT_ICON,
      path: normalizeModulePath(menu.url) ?? `#${menu.slug_name}`,
      ...(children.length ? { children } : {}),
    };
  }

  private readonly tabGroups = inject(NavTabGroupService);
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  constructor(public navLayout: NavLayoutService) { }

  /** A link is active on its own page and on every sibling page of the in-page tab strip it belongs to. */
  isGroupActive(path: string): boolean {
    const url = this.currentUrl();
    if (url === path || url.startsWith(path + '/')) {
      return true;
    }

    return this.tabGroups.groups().some(group =>
      group.includes(url) && group.some(p => p === path || p.startsWith(path + '/')));
  }

  childrenExpanded(path: string): boolean {
    return this.expandedParent() === path;
  }

  setChildrenExpanded(path: string, expanded: boolean): void {
    this.expandedParent.set(expanded ? path : null);
  }

  toggleChildren(path: string): void {
    this.setChildrenExpanded(path, !this.childrenExpanded(path));
  }

  showVerticalSubmenu(link: NavLink): void {
    if (!link.children?.length || this.navLayout.sidebarVisible()) {
      return;
    }

    this.openCompactSubmenu.set(link.path);
  }

  onNavLinkClick(link: NavLink, event: MouseEvent): void {
    if (link.children?.length) {
      event.preventDefault();
      event.stopPropagation();

      if (this.navLayout.sidebarVisible()) {
        this.toggleChildren(link.path);
      } else {
        this.openCompactSubmenu.update(current => (current === link.path ? null : link.path));
      }
      return;
    }

    this.navLayout.closeMobileSidebar();
  }

  onSubnavClick(child: NavLink, event: Event): void {
    if (child.groupOnly) {
      event.preventDefault();
    }
  }

  toggleHorizontalSubmenu(link: NavLink, event: Event): void {
    if (!link.children?.length) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.openHorizontalSubmenu.update(current => (current === link.path ? null : link.path));
  }

  // The submenu is position: fixed (so the scrolling menu strip can't clip it); place it under its item.
  positionHorizontalSubnav(event: Event): void {
    const item = event.currentTarget as HTMLElement | null;
    if (!item) {
      return;
    }

    const rect = item.getBoundingClientRect();
    const subnavWidth = 225;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - subnavWidth - 8));
    item.style.setProperty('--subnav-top', `${rect.bottom + 7}px`);
    item.style.setProperty('--subnav-left', `${left}px`);
  }

  // Let a normal (vertical) mouse wheel scroll the horizontal menu sideways.
  scrollHorizontalNav(event: WheelEvent): void {
    const strip = event.currentTarget as HTMLElement;
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      return;
    }

    event.preventDefault();
    strip.scrollLeft += event.deltaY;
  }

  closeHorizontalSubmenu(): void {
    this.openHorizontalSubmenu.set(null);
  }

  closeCompactSubmenu(): void {
    this.openCompactSubmenu.set(null);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeHorizontalSubmenu();
    this.closeCompactSubmenu();
  }
}
