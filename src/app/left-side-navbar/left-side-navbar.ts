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

  readonly leadChildrenExpanded = signal(true);

  readonly openHorizontalSubmenu = signal<string | null>(null);

  readonly navLinks: NavLink[] = [
    { label: 'Dashboard', icon: 'bi-grid-1x2-fill', path: '/app/dashboard', color: 'blue' },
    {
      label: 'Lead Management',
      icon: 'bi-person-lines-fill',
      path: '/app/lead-management',
      color: 'green',
      children: [
        { label: 'Follow-Ups', icon: 'bi-arrow-repeat', path: '/app/follow-ups' },
      ],
    },
    {
      label: 'Look Up Masters',
      icon: 'bi-boxes',
      path: '',
      color: 'purple',
      groupOnly: true,
      children: [
        { label: 'Service-Category', icon: 'bi-tags-fill', path: '/app/masters/service-category'},
        { label: 'Source', icon: 'bi-signpost-2-fill', path: '/app/masters/source'},
        { label: 'Lead-Status', icon: 'bi-flag-fill', path: '/app/masters/lead-status'},
        { label: 'Roles', icon: 'bi-shield-lock-fill', path: '/app/masters/roles'},
      ],
    },
    { label: 'Appointment', icon: 'bi-calendar-check-fill', path: '/app/appointments', color: 'orange' },
    { label: 'Client', icon: 'bi-person-vcard-fill', path: '/app/customers', color: 'pink' },
    { label: 'Settings', icon: 'bi-gear-fill', path: '/app/settings', color: 'gray' },
  ];

  constructor(public navLayout: NavLayoutService) { }

  toggleLeadChildren(): void {
    this.leadChildrenExpanded.update(expanded => !expanded);
  }

  onNavLinkClick(link: NavLink, event: Event): void {
    if (link.groupOnly) {
      event.preventDefault();
    }

    if (link.children?.length) {
      this.toggleLeadChildren();
      return;
    }

    // On phones the sidebar is an overlay drawer; picking a page should close it.
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

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeHorizontalSubmenu();
  }
}
