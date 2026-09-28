import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavLayoutService } from '../services/nav-layout.service';
import { AuthService } from '../core/auth/auth.service';
import { SidebarModule } from '../shared/models/permission.model';

interface NavLink {
  label: string;
  icon: string;
  path: string;
  children?: NavLink[];
  groupOnly?: boolean;
  /** Matches this item to a `slug_name` in the Roles & Permissions module tree. When set,
   *  the item is only shown if the logged-in user's role is granted that module (via
   *  AuthService.hasModuleAccess). Left unset for items not yet managed by that screen,
   *  which always stay visible rather than disappearing for everyone. */
  permissionSlug?: string;
}

@Component({
  selector: 'app-left-side-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './left-side-navbar.html',
  styleUrl: './left-side-navbar.scss',
})
export class LeftSideNavbar {

  readonly expandedParent = signal<string | null>(null);
  readonly openHorizontalSubmenu = signal<string | null>(null);
  readonly openCompactSubmenu = signal<string | null>(null);
  private readonly auth = inject(AuthService);

  private readonly ICON_BY_SLUG: Record<string, string> = {
    'dashboard': 'bi-house-fill',
    'lead-management': 'bi-person-lines-fill',
    'follow-up': 'bi-arrow-repeat',
    'follow-ups': 'bi-arrow-repeat',
    'appointments': 'bi-calendar2-check-fill',
    'appoinment': 'bi-calendar2-check-fill',
    'customer-management': 'bi-person-fill',
    'treatment-management': 'bi-heart-pulse-fill',
    'call-center': 'bi-telephone-inbound-fill',
    'tele-caller': 'bi-telephone-inbound-fill',
    'settings': 'bi-gear-fill',
    'service-category': 'bi-tags-fill',
    'source': 'bi-signpost-2-fill',
    'lead-status': 'bi-flag-fill',
    'roles': 'bi-shield-lock-fill',
    'roles-permissions': 'bi-shield-lock-fill',
    'reports': 'bi-bar-chart-fill',
  };
  private readonly DEFAULT_ICON = 'bi-dot';

  readonly navLinks = computed<NavLink[]>(() => {
    const menus = this.auth.menus();
    return menus.length ? menus.map(menu => this.toNavLink(menu)) : [];
  });

  private toNavLink(menu: SidebarModule): NavLink {
    const children = (menu.sub_modules ?? []).map(sub => this.toNavLink(sub));

    return {
      label: menu.module_name,
      icon: menu.icon || this.ICON_BY_SLUG[menu.slug_name] || this.DEFAULT_ICON,
      path: this.normalizePath(menu.url) ?? `#${menu.slug_name}`,
      ...(children.length ? { children } : {}),
    };
  }

  private normalizePath(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.startsWith('/') ? url : `/${url}`;
  }

  /** `allNavLinks` filtered to what the logged-in user's role is granted. An item with no
   *  `permissionSlug` (not yet managed by Roles & Permissions) always stays visible. */
  // readonly navLinks = computed<NavLink[]>(() => {
  //   // Reading the signal here (rather than calling hasModuleAccess per item without it) is what
  //   // makes this recompute whenever permissions load/change.
  //   this.authService.permissions();
  //   const visible = (link: NavLink): boolean =>
  //     !link.permissionSlug || this.authService.hasModuleAccess(link.permissionSlug);

  //   return this.allNavLinks
  //     .filter(visible)
  //     .map((link) => (link.children ? { ...link, children: link.children.filter(visible) } : link));
  // });

  constructor(public navLayout: NavLayoutService, private authService: AuthService) { }

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
