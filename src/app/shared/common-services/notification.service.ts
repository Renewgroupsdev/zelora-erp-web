import { Injectable, computed, signal } from '@angular/core';

export type NotificationType = 'lead' | 'appointment' | 'stock' | 'discount' | 'manager' | 'purchase' | 'hr' | 'accounts' | 'chat';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  /** Route to navigate to when the notification is clicked, if any. */
  link?: string;
  /** Something other than a route to do when it is clicked (the navbar handles it), e.g. open a discount request to decide it. */
  action?: { kind: 'discount-review'; id: number } | { kind: 'reassign-leads'; telecallerId: number; telecallerName: string; leadIds: number[] };
}

const ICONS: Record<NotificationType, string> = {
  lead: 'bi-person-plus',
  appointment: 'bi-calendar-check',
  stock: 'bi-box-seam',
  discount: 'bi-percent',
  manager: 'bi-person-check',
  purchase: 'bi-cart-check',
  hr: 'bi-people',
  accounts: 'bi-cash-coin',
  chat: 'bi-chat-dots',
};

const COLORS: Record<NotificationType, string> = {
  lead: 'notification-icon-green',
  appointment: 'notification-icon-blue',
  stock: 'notification-icon-orange',
  discount: 'notification-icon-purple',
  manager: 'notification-icon-teal',
  purchase: 'notification-icon-blue',
  hr: 'notification-icon-teal',
  accounts: 'notification-icon-green',
  chat: 'notification-icon-purple',
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

  /**
   * Pending discount requests (GET appointment-flow/discount-requests) as notifications for the branch manager. Each
   * request has one notification (id DISC-<id>) that keeps its read state while it stays pending and disappears once it
   * is decided. Returns how many requests are new since the last sync (the caller may alert on them).
   */
  syncDiscountRequests(requests: { id: number; customer: string; treatments: string; subtotal: number; asked: string; requestedBy: string; at: Date }[]): number {
    const known = new Set(this._notifications().filter(n => n.id.startsWith('DISC-')).map(n => n.id));
    const keep = new Map(requests.map(r => [`DISC-${r.id}`, r]));
    const fresh = requests.filter(r => !known.has(`DISC-${r.id}`));

    this._notifications.update(list => [
      ...fresh.map((r): AppNotification => ({
        id: `DISC-${r.id}`,
        type: 'discount',
        title: 'Discount approval needed',
        message: `${r.requestedBy} asked ${r.asked} off ${r.customer}'s ${r.treatments} (total ₹${r.subtotal.toLocaleString('en-IN')}).`,
        timestamp: r.at,
        read: false,
        action: { kind: 'discount-review', id: r.id },
      })),
      ...list.filter(n => !n.id.startsWith('DISC-') || keep.has(n.id)),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));

    return fresh.length;
  }

  /**
   * Telecallers absent today who still hold open leads (GET telephony/leads/absent-alerts), one notification each
   * (id ABS-<telecaller>-<date>) asking the branch manager to reassign them. It keeps its read state while the
   * telecaller stays absent with leads and disappears once the leads are reassigned. Returns how many are new.
   */
  syncAbsentTelecallers(alerts: { telecaller_id: number; telecaller_name: string; state: string; date: string; leads_count: number; due_today: number; lead_ids: number[] }[]): number {
    const known = new Set(this._notifications().filter(n => n.id.startsWith('ABS-')).map(n => n.id));
    const byId = new Map(alerts.map(a => [`ABS-${a.telecaller_id}-${a.date}`, a]));
    const fresh = alerts.filter(a => !known.has(`ABS-${a.telecaller_id}-${a.date}`));
    const toNotification = (a: (typeof alerts)[number], read = false): AppNotification => ({
      id: `ABS-${a.telecaller_id}-${a.date}`,
      type: 'manager',
      title: `${a.telecaller_name} is ${a.state === 'on_leave' ? 'on leave' : 'absent'} today`,
      message: `${a.leads_count} lead${a.leads_count === 1 ? '' : 's'} to follow up` + (a.due_today ? ` (${a.due_today} due today)` : '')
        + ' - reassign them to a telecaller who is in.',
      timestamp: new Date(),
      read,
      action: { kind: 'reassign-leads', telecallerId: a.telecaller_id, telecallerName: a.telecaller_name, leadIds: a.lead_ids },
    });

    this._notifications.update(list => [
      ...fresh.map(a => toNotification(a)),
      // Known ones keep their read state / time but take the current lead list.
      ...list.filter(n => !n.id.startsWith('ABS-') || byId.has(n.id))
        .map(n => (n.id.startsWith('ABS-') ? { ...toNotification(byId.get(n.id)!, n.read), timestamp: n.timestamp } : n)),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));

    return fresh.length;
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
