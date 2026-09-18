import { Component, HostListener, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavLayoutService } from '../services/nav-layout.service';

interface NavLink {
  label: string;
  icon: string;
  path: string;
  children?: NavLink[];
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
    { label: 'Dashboard', icon: 'bi-grid-1x2-fill', path: '/app/dashboard' },
    {
      label: 'Lead Management',
      icon: 'bi-person-lines-fill',
      path: '/app/lead-management',
      children: [
        { label: 'Follow-Ups', icon: 'bi-arrow-repeat', path: '/app/follow-ups' },
      ],
    },
    { label: 'Appointment', icon: 'bi-calendar-check-fill', path: '/app/appointments' },
    { label: 'Client', icon: 'bi-person-vcard-fill', path: '/app/customers' },
    { label: 'Settings', icon: 'bi-gear-fill', path: '/app/settings' },
  ];

  constructor(public navLayout: NavLayoutService) { }

  toggleLeadChildren(): void {
    this.leadChildrenExpanded.update(expanded => !expanded);
  }

  onNavLinkClick(link: NavLink): void {
    if (link.children?.length) {
      this.toggleLeadChildren();
      return;
    }

    // On phones the sidebar is an overlay drawer; picking a page should close it.
    this.navLayout.closeMobileSidebar();
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
