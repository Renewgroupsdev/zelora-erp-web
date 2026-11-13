import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TelephonySocketService } from '../../core/telephony/telephony-socket.service';
import { AlertStackService } from './alert-stack.service';
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
  low_stock_replenishment: '/app/inventory/low-stock-replenishment',
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
      if (live && !this.wasLive) queueMicrotask(() => this.topic$.next('all'));
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
  }

  stop(): void {
    if (!this.started()) return;
    this.started.set(false);
    this.wasLive = false;
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
