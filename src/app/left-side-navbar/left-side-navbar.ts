import { Component, HostListener, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavLayoutService } from '../services/nav-layout.service';

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

  readonly navLinks: NavLink[] = [
    { label: 'Dashboard', icon: 'bi-house-fill', path: '/app/dashboard' },
    {
      label: 'Lead Management',
      icon: 'bi-person-lines-fill',
      path: '/app/lead-management',
      children: [
        { label: 'Follow-up', icon: 'bi-arrow-repeat', path: '/app/follow-ups' },
      ],
    },
    { label: 'Appointments', icon: 'bi-calendar2-check-fill', path: '/app/appointments' },
    { label: 'Customer Management', icon: 'bi-person-fill', path: '/app/customers' },
    {
      label: 'Treatment Management',
      icon: 'bi-heart-pulse-fill',
      path: '/app/treatments',
      // children: [
      //   { label: 'Create Treatment', icon: 'bi-heart-pulse', path: '/app/treatments/create' },
      // ],
    },
    { label: 'Tele Caller', icon: 'bi-telephone-inbound-fill', path: '/app/call-center' },
    { label: 'Settings', icon: 'bi-gear-fill', path: '/app/settings', 
      
      children: [
          { label: 'Service-Category', icon: 'bi-tags-fill', path: '/app/masters/service-category'},
          { label: 'Source', icon: 'bi-signpost-2-fill', path: '/app/masters/source'},
          { label: 'Lead-Status', icon: 'bi-flag-fill', path: '/app/masters/lead-status'},
          { label: 'Roles', icon: 'bi-shield-lock-fill', path: '/app/masters/roles'},
          { label: 'Roles-&-permssions', icon: 'bi-shield-lock-fill', path: '/app/masters/roles-and-permission'},
        ],
    },
    { label: 'Reports', icon: 'bi-bar-chart-fill', path: '/app/reports' },
  ];

  constructor(public navLayout: NavLayoutService) { }

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
