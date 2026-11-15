import { Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ApiDataService } from '../../core/http/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { FlowDiscountRequest, inr } from '../models/appointment-flow.model';
import { ApiRoutesConstants } from './api-route-constants';
import { DiscountReviewDialog } from '../components/discount-review-dialog/discount-review-dialog';
import { AlertStackItem, AlertStackService } from './alert-stack.service';
import { NotificationService } from './notification.service';
import { Subscription } from 'rxjs';
import { BellRealtimeService } from './bell-realtime.service';

/** Roles & Permissions -> Appointment module action: who may decide a discount request (the API checks the same). */
export const APPROVE_DISCOUNT_ACTION = 'approve-discount';

const POLL_MS = 15_000;

/**
 * Discount requests waiting for the signed-in approver (a branch manager sees their branch's, an admin all). They are
 * polled every few seconds and shown in the bell as notifications - the API is the single source, so a request
 * decided by someone else drops out on the next poll. Only does anything for a role ticked on "Approve / Reject Discount".
 */
@Injectable({ providedIn: 'root' })
export class DiscountRequestsService {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly alertStack = inject(AlertStackService);
  private readonly dialog = inject(MatDialog);

  private readonly realtime = inject(BellRealtimeService);

  readonly pending = signal<FlowDiscountRequest[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;
  private live?: Subscription;
  private lastReadAt = 0;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.refresh();
  };

  /** Starts listening (WebSocket) + polling (fallback, slow while the socket is live); safe to call again. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { if (!this.realtime.skipPoll(this.lastReadAt)) this.refresh(); }, POLL_MS);
    this.live = this.realtime.topic$.subscribe(t => { if (t === 'discount' || t === 'all') this.refresh(true); });
    document.addEventListener('visibilitychange', this.onVisible);
    this.refresh();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.live?.unsubscribe();
    this.live = undefined;
    document.removeEventListener('visibilitychange', this.onVisible);
    this.clear();
  }

  /** Reads the waiting requests now (also called right after a decision so the bell updates at once). */
  refresh(force = false): void {
    if (!this.auth.isAuthenticated()) return this.stop();
    if (!this.auth.hasActionAccess(APPROVE_DISCOUNT_ACTION)) return this.clear();
    if (!force && document.visibilityState === 'hidden') return;

    this.lastReadAt = Date.now();
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/discount-requests?status=Pending`).subscribe({
      next: (res: any) => {
        const list = (res?.data ?? []) as FlowDiscountRequest[];
        this.pending.set(list);
        const fresh = this.notifications.syncDiscountRequests(list.map(r => ({
          id: r.id,
          customer: r.customer?.name ?? 'the customer',
          treatments: r.treatments ?? 'treatments',
          subtotal: Number(r.subtotal_amount),
          asked: r.discount_type === 'percent' ? `${r.requested_value}% (${inr(r.requested_amount)})` : inr(r.requested_amount),
          requestedBy: r.requested_by ?? 'Staff',
          at: r.requested_at ? new Date(r.requested_at) : new Date(),
        })));
        // one card per request, sliding in one below the other (a big batch shows the first few + one summary card)
        const MAX_CARDS = 4;
        const cards: AlertStackItem[] = fresh.slice(0, MAX_CARDS).map(r => ({
          tone: 'info', icon: 'bi-percent',
          title: 'Discount approval needed',
          text: `${r.requestedBy} asked for a discount on ${r.customer}'s ${r.treatments}.`,
          chips: [`${r.asked} off`, `Total ${inr(r.subtotal)}`],
          duration: 9000, actionLabel: 'Review',
          onAction: () => this.dialog
            .open(DiscountReviewDialog, { width: '640px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, restoreFocus: true, data: { id: r.id } })
            .afterClosed().subscribe(() => this.refresh(true)),
        }));
        if (fresh.length > MAX_CARDS) {
          cards.push({ tone: 'info', icon: 'bi-collection-fill', title: `+ ${fresh.length - MAX_CARDS} more discount requests`, text: 'Open the notification bell to review them.', duration: 9000 });
        }
        this.alertStack.show(...cards);
      },
      error: () => undefined, // the next tick simply tries again
    });
  }

  private clear(): void {
    if (this.pending().length) this.pending.set([]);
    this.notifications.syncDiscountRequests([]);
  }
}
