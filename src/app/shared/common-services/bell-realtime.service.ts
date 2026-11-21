import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { TelephonySocketService } from '../../core/telephony/telephony-socket.service';
import { AlertStackService } from './alert-stack.service';
import { SupportReminderService } from './support-reminder.service';
import { NotificationService, NotificationType } from './notification.service';

/** Lists behind the bell; the backend broadcasts `bell.changed` with one of these (App\Events\Notifications\BellChangedEvent). */
export type BellTopic = 'discount' | 'sitting-transfer' | 'purchase-request' | 'price-revision' | 'low-stock' | 'absent';

/** While the socket is live the pollers only run this often (a safety net for a missed event). */
export const LIVE_FALLBACK_MS = 5 * 60_000;

/** A personal notification of one of these types is shown by a bell list already: its topic is re-read instead. */
const TYPE_TOPICS: Record<string, BellTopic> = {
  purchase_request: 'purchase-request',
  purchase_request_urgent: 'purchase-request',
  purchase_price_revision: 'price-revision',
  central_low_stock: 'low-stock',
  sitting_transfer_request: 'sitting-transfer',
};

/** Employee-app only notifications (own login / check-in / geofence): not shown on the web bell. */
const APP_ONLY = new Set(['login', 'attendance_check_in', 'attendance_check_out', 'geofence_warning', 'geofence_return']);

/** Deep link of a personal notification (`data.screen` from the backend). */
const SCREEN_LINKS: Record<string, string> = {
  purchase: '/app/inventory/purchase-requests',
  stock_transfer: '/app/inventory/stock',
  low_stock_replenishment: '/app/inventory/stock', // older notifications
  sitting_transfer: '/app/appointments',
  attendance: '/app/hr/attendance',
};

/**
 * Real-time notification bell over the shared Reverb WebSocket.
 *
 *  - private-notifications, `bell.changed` {topic}: a list behind the bell changed (discount request, sitting transfer,
 *    purchase request, price revision, Central Store stock, lead reassignment) -> `topic$` tells that list's service to
 *    re-read it at once.
 *  - private-App.Models.User.{id}, `notification.created`: a notification stored for this login (EmployeeNotifier) ->
 *    shown in the bell straight away.
 *
 * The list services keep a slow poll as a safety net (`skipPoll`); when the socket is down they poll at their usual speed.
 * On every (re)connect all topics are re-read once, so nothing that happened while it was down is missed.
 */
@Injectable({ providedIn: 'root' })
export class BellRealtimeService {
  private readonly socket = inject(TelephonySocketService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly alertStack = inject(AlertStackService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly supportReminder = inject(SupportReminderService);
  private readonly supportUrl = `${environment.apiBaseUrl}support/notifications`;
  private supportTimer: ReturnType<typeof setInterval> | undefined;
  private readonly seenSupport = new Set<number>();
  private supportPrimed = false;

  private readonly started = signal(false);
  /** true while bell events arrive over the socket. */
  readonly live = computed(() => this.started() && this.socket.state() === 'connected');
  /** A bell list changed ('all' after a reconnect). */
  readonly topic$ = new Subject<BellTopic | 'all'>();

  private wasLive = false;

  constructor() {
    // (re)connected: re-read every list once (events sent while the socket was down are lost)
    effect(() => {
      const live = this.live();
      if (live && !this.wasLive) queueMicrotask(() => { this.topic$.next('all'); this.loadSupport(); });
      this.wasLive = live;
    });
    // signed out: close the bell's part of the socket
    effect(() => {
      if (!this.auth.isAuthenticated() && this.started()) queueMicrotask(() => this.stop());
    });
  }

  start(): void {
    const user = this.auth.currentUser();
    if (this.started() || !user?.id) return;
    this.started.set(true);

    this.socket.connect('bell');
    this.socket.listen('bell', 'notifications', 'bell.changed', (data: { topic?: string }) => {
      if (data?.topic) this.topic$.next(data.topic as BellTopic);
    });
    this.socket.listen('bell', `App.Models.User.${user.id}`, 'notification.created', (data: any) => this.onPersonal(data));

    // Support ticket notifications are stored per login: read them now, and keep the read state saved on the server.
    this.notifications.persistRead = (id) => this.saveRead(id);
    this.loadSupport();
    this.supportReminder.start();
    // Safety net while the socket is down (nothing arrives live then).
    this.supportTimer = setInterval(() => { if (!this.live()) this.loadSupport(); }, 30_000);
  }

  /** Support notifications of this login (newest first, unread highlighted, read state from the server). */
  loadSupport(): void {
    this.http.get<any>(this.supportUrl).subscribe({
      next: (res) => {
        const rows: any[] = res?.data ?? [];
        this.alertNewSupport(rows);
        this.notifications.replaceSupport(rows.map((n) => ({
          id: `SUP-${n.id}`,
          type: 'support' as NotificationType,
          title: n.title,
          message: n.body ?? '',
          timestamp: new Date(n.created_at),
          read: !!n.is_read,
          link: n.path || (n.ticket_number ? `/app/support/tickets/${n.ticket_number}` : undefined),
        })));
      },
      error: () => { /* the bell keeps what it has; the next live event or the poll tries again */ },
    });
  }

  /**
   * Alert (card + OS toast) once for every unread support notification not seen before. Runs on every read of the list, so
   * it works for socket events and for the poll alike. The first read after sign-in / refresh alerts for the newest unread ones (card only, no OS toast).
   */
  private alertNewSupport(rows: any[]): void {
    const unread = rows.filter((n) => !n.is_read);
    const fresh = unread.filter((n) => !this.seenSupport.has(n.id));
    unread.forEach((n) => this.seenSupport.add(n.id));
    // First read after sign-in / page refresh: every unread one is still pending for this person, so alert for the newest ones.
    const first = !this.supportPrimed;
    this.supportPrimed = true;
    for (const n of (first ? unread : fresh).slice(0, 8)) this.supportCard(n.title, String(n.body ?? ''), String(n.ticket_number ?? ''), String(n.path ?? ''), !first);
  }

  /** One alert card + OS toast for a support notification (same key for the live event and the list read: shown once). */
  private supportCard(title: string, body: string, ticket: string, pathIn: string, osToast = true): void {
    const path = pathIn || (ticket ? `/app/support/tickets/${ticket}` : '');
    const lines = body.split('\n').filter((l) => l && !l.startsWith('Ticket:'));
    const text = lines.slice(0, 3).join(' · ');
    // the person who acted: "Harish Chandran replied: hii" / "Updated by: Sathya"
    const who = /^(.+?) (?:replied|commented|added|uploaded)\b/.exec(text)?.[1] ?? /Updated by:\s*(.+?)(?: Previous| New| Update:| · |$)/.exec(text)?.[1];
    this.alertStack.show({
      tone: 'info',
      icon: 'bi-headset',
      title,
      text,
      strong: who?.trim(),
      chips: ticket ? [ticket] : undefined,
      duration: 10000,
      key: `support-${ticket}-${title}`,
      osToast,
      actionLabel: path ? 'Open ticket' : undefined,
      onAction: path ? () => void this.router.navigateByUrl(path) : undefined,
    });
  }

  /** 'SUP-12' -> PATCH support/notifications/12/read; 'ALL' -> read-all. */
  private saveRead(id: string): void {
    const url = id === 'ALL' ? `${this.supportUrl}/read-all` : `${this.supportUrl}/${id.replace('SUP-', '')}/read`;
    this.http.patch(url, {}).subscribe({ error: () => this.loadSupport() });
  }

  stop(): void {
    if (!this.started()) return;
    clearInterval(this.supportTimer);
    this.supportReminder.stop();
    this.notifications.persistRead = null;
    this.started.set(false);
    this.wasLive = false;
    this.seenSupport.clear();
    this.supportPrimed = false;
    this.socket.disconnect('bell');
  }

  /** For the list services' timers: true = skip this tick (socket live and the list was read within the fallback window). */
  skipPoll(lastReadAt: number): boolean {
    return this.live() && Date.now() - lastReadAt < LIVE_FALLBACK_MS;
  }

  /** A notification stored for this login: re-read the list that shows it, or put it in the bell as it is. */
  private onPersonal(n: { type?: string; title?: string; body?: string; data?: Record<string, unknown> }): void {
    const type = String(n?.type ?? '');
    const topic = TYPE_TOPICS[type];
    if (topic) return void this.topic$.next(topic);
    if (!type || APP_ONLY.has(type) || !n.title) return;

    // A support ticket event: re-read the stored list; loadSupport alerts for the new entry (card + OS toast).
    if (type.startsWith('support_')) {
      this.loadSupport();
      this.supportCard(n.title, String(n.body ?? ''), String(n.data?.['ticket_number'] ?? ''), String(n.data?.['path'] ?? ''));
      return;
    }

    const screen = String(n.data?.['screen'] ?? '');
    this.notifications.add({ type: this.kind(type), title: n.title, message: n.body ?? '', link: SCREEN_LINKS[screen] });
    this.alertStack.show({ tone: 'info', icon: 'bi-bell-fill', title: n.title, text: n.body ?? '', duration: 7000 });
  }

  private kind(type: string): NotificationType {
    if (type.startsWith('purchase') || type.includes('stock')) return 'purchase';
    if (type.startsWith('sitting') || type.includes('appointment')) return 'appointment';
    if (type.includes('attendance') || type.includes('leave') || type.includes('work_report')) return 'hr';
    if (type.includes('discount')) return 'discount';
    return 'manager';
  }
}
