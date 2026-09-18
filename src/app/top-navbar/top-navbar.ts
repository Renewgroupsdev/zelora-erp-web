import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NavLayoutService } from '../services/nav-layout.service';
import { AppNotification, NotificationService } from '../shared/common-services/notification.service';

@Component({
  selector: 'app-top-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './top-navbar.html',
  styleUrl: './top-navbar.scss',
})
export class TopNavbar {

  constructor(
    public navLayout: NavLayoutService,
    public notifications: NotificationService,
    private router: Router,
  ) { }

  onNotificationClick(notification: AppNotification): void {
    this.notifications.markRead(notification.id);

    if (notification.link) {
      this.navLayout.closeNotifications();
      this.router.navigate([notification.link]);
    }
  }

  markAllRead(): void {
    this.notifications.markAllRead();
  }

  /** 3-bar icon: collapsed (icons only) by default, expands to show link names. */
  onToggleSidebar(): void {
    this.navLayout.toggleSidebar();
  }

  goToDashboard(): void {
    this.router.navigate(['/app/dashboard']);
  }

  onToggleSettingsMenu(): void {
    this.navLayout.toggleSettingsMenu();
  }

  onToggleNotifications(): void {
    this.navLayout.toggleNotifications();
  }

  goToSettings(): void {
    this.navLayout.closeSettingsMenu();
    this.router.navigate(['/app/settings']);
  }

  logout(): void {
    this.navLayout.closeSettingsMenu();
    this.router.navigate(['/login']);
  }
}
