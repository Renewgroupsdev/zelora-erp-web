import { Component, HostListener, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavLayoutService } from '../services/nav-layout.service';
import { AuthService } from '../core/auth/auth.service';

interface NavLink {
  label: string;
  icon: string;
  path: string;
  children?: NavLink[];
  /** True when this item has no page of its own yet - a parent with this set only
   *  expands/collapses its children, and a leaf with this set never navigates. Either way
   *  it never shows as the active route. Also keeps every item's `path` unique, which
   *  Angular's `@for track` needs to render each row independently. */
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

  /** Path of the one parent module whose submenu is expanded, or null when all are collapsed.
   *  Only one parent can be open at a time - opening another closes whichever was open. */
  readonly expandedParent = signal<string | null>(null);

  readonly openHorizontalSubmenu = signal<string | null>(null);

  readonly openCompactSubmenu = signal<string | null>(null);

  /** Full menu, unfiltered - `navLinks` below filters this down by the logged-in user's role. */
  private readonly allNavLinks: NavLink[] = [
    { label: 'Dashboard', icon: 'bi-house-fill', path: '/app/dashboard', permissionSlug: 'dashboard' },
    {
      label: 'Lead Management',
      icon: 'bi-person-lines-fill',
      path: '/app/lead-management',
      permissionSlug: 'lead-management',
      children: [
        { label: 'Follow-up', icon: 'bi-arrow-repeat', path: '/app/follow-ups', permissionSlug: 'follow-up' },
      ],
    },
    { label: 'Appointments', icon: 'bi-calendar2-check-fill', path: '/app/appointments', permissionSlug: 'appoinment' },
    { label: 'Customer Management', icon: 'bi-person-fill', path: '/app/customers', permissionSlug: 'customer-management' },
    {
      label: 'Treatment Management',
      icon: 'bi-heart-pulse-fill',
      path: '/app/treatments',
      permissionSlug: 'treatment-management',
      // children: [
      //   { label: 'Create Treatment', icon: 'bi-heart-pulse', path: '/app/treatments/create' },
      // ],
    },
    { label: 'Tele Caller', icon: 'bi-telephone-inbound-fill', path: '/app/call-center' },
    { label: 'Settings', icon: 'bi-gear-fill', path: '/app/settings', permissionSlug: 'settings',

      children: [
          { label: 'Service-Category', icon: 'bi-tags-fill', path: '/app/masters/service-category', permissionSlug: 'service-category'},
          { label: 'Source', icon: 'bi-signpost-2-fill', path: '/app/masters/source', permissionSlug: 'source'},
          { label: 'Lead-Status', icon: 'bi-flag-fill', path: '/app/masters/lead-status', permissionSlug: 'lead-status'},
          { label: 'Roles', icon: 'bi-shield-lock-fill', path: '/app/masters/roles', permissionSlug: 'roles'},
          { label: 'Roles-&-permssions', icon: 'bi-shield-lock-fill', path: '/app/masters/roles-and-permission', permissionSlug: 'roles-permissions'},
        ],
    },
    { label: 'Reports', icon: 'bi-bar-chart-fill', path: '/app/reports', permissionSlug: 'reports' },
  ];

  /** `allNavLinks` filtered to what the logged-in user's role is granted. An item with no
   *  `permissionSlug` (not yet managed by Roles & Permissions) always stays visible. */
  readonly navLinks = computed<NavLink[]>(() => {
    // Reading the signal here (rather than calling hasModuleAccess per item without it) is what
    // makes this recompute whenever permissions load/change.
    this.authService.permissions();
    const visible = (link: NavLink): boolean =>
      !link.permissionSlug || this.authService.hasModuleAccess(link.permissionSlug);

    return this.allNavLinks
      .filter(visible)
      .map((link) => (link.children ? { ...link, children: link.children.filter(visible) } : link));
  });

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

    // Navigating straight to a leaf item (e.g. Appointments) - whatever group was expanded is
    // no longer relevant to the page you're on, so close it instead of leaving it open behind
    // the new active item.
    // this.expandedSubmenu.set(null);
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
