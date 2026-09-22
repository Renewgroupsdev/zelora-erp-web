import { Component, HostListener, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavLayoutService } from '../services/nav-layout.service';

interface NavLink {
  label: string;
  icon: string;
  path: string;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'gray';
  children?: NavLink[];
  /** True when this item has no page of its own yet - a parent with this set only
   *  expands/collapses its children, and a leaf with this set never navigates. Either way
   *  it never shows as the active route. Also keeps every item's `path` unique, which
   *  Angular's `@for track` needs to render each row independently. */
  groupOnly?: boolean;
}

@Component({
  selector: 'app-left-side-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './left-side-navbar.html',
  styleUrl: './left-side-navbar.scss',
})
export class LeftSideNavbar {

  /** Path of the one parent nav item whose children are expanded in the full (labeled) vertical
   *  sidebar - null means every group is collapsed. Tracking the path (not a shared boolean)
   *  is what makes opening one group close any other. */
  readonly expandedSubmenu = signal<string | null>(null);

  readonly openHorizontalSubmenu = signal<string | null>(null);

  readonly openCompactSubmenu = signal<string | null>(null);

  readonly navLinks: NavLink[] = [
    { label: 'Dashboard', icon: 'bi-house-fill', path: '/app/dashboard' },
    {
      label: 'Lead Management',
      icon: 'bi-person-lines-fill',
      path: '/app/lead-management',
      color: 'green',
      children: [
        { label: 'Follow-up', icon: 'bi-arrow-repeat', path: '/app/follow-ups' },
      ],
    },
    { label: 'Appointments', icon: 'bi-calendar2-check-fill', path: '/app/appointments', color: 'orange' },
    { label: 'Customer Management', icon: 'bi-person-fill', path: '/app/customers', color: 'pink' },
    { label: 'Settings', 
      icon: 'bi-gear-fill', 
      path: '/app/settings', 
      color: 'gray',

      children: [
        { label: 'Service-Category', icon: 'bi-tags-fill', path: '/app/masters/service-category'},
        { label: 'Source', icon: 'bi-signpost-2-fill', path: '/app/masters/source'},
        { label: 'Lead-Status', icon: 'bi-flag-fill', path: '/app/masters/lead-status'},
        { label: 'Roles', icon: 'bi-shield-lock-fill', path: '/app/masters/roles'},
        { label: 'Roles-&-permssions', icon: 'bi-shield-lock-fill', path: '/app/masters/roles-and-permission'},
      ],
    
    },
    { label: 'Reports', icon: 'bi-bar-chart-fill', path: '/app/reports', color: 'gray'},
  ];

  constructor(public navLayout: NavLayoutService) { }

  /** Exclusive accordion toggle - opening a group's children always closes whichever other
   *  group was open, instead of both staying expanded at once. */
  toggleSubmenu(link: NavLink): void {
    this.expandedSubmenu.update(current => (current === link.path ? null : link.path));
  }

  showVerticalSubmenu(link: NavLink): void {
    if (!link.children?.length) {
      return;
    }

    // Only the collapsed/icon-only sidebar opens its flyout on hover - the full labeled
    // sidebar's inline accordion only responds to an explicit click (toggleSubmenu), so hovering
    // over a different group here doesn't force it open on top of one already expanded.
    if (!this.navLayout.sidebarVisible()) {
      this.openCompactSubmenu.set(link.path);
    }
  }

  onNavLinkClick(link: NavLink, event: MouseEvent): void {
    if (link.children?.length) {
      event.preventDefault();
      event.stopPropagation();

      if (this.navLayout.sidebarVisible()) {
        this.toggleSubmenu(link);
      } else {
        this.openCompactSubmenu.update(current => (current === link.path ? null : link.path));
      }
      return;
    }

    // Navigating straight to a leaf item (e.g. Appointments) - whatever group was expanded is
    // no longer relevant to the page you're on, so close it instead of leaving it open behind
    // the new active item.
    this.expandedSubmenu.set(null);
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
