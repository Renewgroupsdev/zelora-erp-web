import { Injectable, computed, signal } from '@angular/core';

export type NotificationType = 'lead' | 'appointment' | 'stock' | 'discount' | 'manager';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  /** Route to navigate to when the notification is clicked, if any. */
  link?: string;
}

const ICONS: Record<NotificationType, string> = {
  lead: 'bi-person-plus',
  appointment: 'bi-calendar-check',
  stock: 'bi-box-seam',
  discount: 'bi-percent',
  manager: 'bi-person-check',
};

const COLORS: Record<NotificationType, string> = {
  lead: 'notification-icon-green',
  appointment: 'notification-icon-blue',
  stock: 'notification-icon-orange',
  discount: 'notification-icon-purple',
  manager: 'notification-icon-teal',
};

/**
 * Central place notifications get pushed from (a discount applied while booking,
 * a new lead saved, low stock, etc.) and the single source the bell icon reads
 * from, so "3 unread" always matches what's actually in the list.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly _notifications = signal<AppNotification[]>(this.buildSeed());

  readonly notifications = this._notifications.asReadonly();
  readonly unreadCount = computed(() => this._notifications().filter((n) => !n.read).length);

  icon(type: NotificationType): string {
    return ICONS[type];
  }

  colorClass(type: NotificationType): string {
    return COLORS[type];
  }

  add(notification: { type: NotificationType; title: string; message: string; link?: string }): void {
    const entry: AppNotification = {
      id: `NTF-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      timestamp: new Date(),
      read: false,
      ...notification,
    };

    this._notifications.update((list) => [entry, ...list]);
  }

  markRead(id: string): void {
    this._notifications.update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  markAllRead(): void {
    this._notifications.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  relativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  private buildSeed(): AppNotification[] {
    const now = Date.now();

    return [
      {
        id: 'NTF-seed-1',
        type: 'lead',
        title: 'New lead added',
        message: 'Arjun Nair was added to the pipeline from Velachery.',
        timestamp: new Date(now - 2 * 60 * 1000),
        read: false,
        link: '/app/lead-management',
      },
      {
        id: 'NTF-seed-2',
        type: 'discount',
        title: 'Discount request',
        message: "Priya Sharma requested a 15% discount on Ananya Sharma's Bridal Package booking.",
        timestamp: new Date(now - 18 * 60 * 1000),
        read: false,
        link: '/app/appointments',
      },
      {
        id: 'NTF-seed-3',
        type: 'stock',
        title: 'Low stock alert',
        message: 'Hyaluronic Acid Serum is running low at Anna Nagar branch (4 units left).',
        timestamp: new Date(now - 55 * 60 * 1000),
        read: false,
      },
      {
        id: 'NTF-seed-4',
        type: 'manager',
        title: 'Branch manager notified',
        message: 'Anna Nagar branch manager has been notified about the pending discount approval.',
        timestamp: new Date(now - 60 * 60 * 1000),
        read: true,
      },
      {
        id: 'NTF-seed-5',
        type: 'appointment',
        title: 'Appointment reminder',
        message: 'Ananya Sharma has an appointment today at 9:30 AM.',
        timestamp: new Date(now - 2 * 60 * 60 * 1000),
        read: true,
        link: '/app/appointments',
      },
    ];
  }
}
