import { Injectable, inject, signal } from '@angular/core';
import Swal from 'sweetalert2';
import { ApiDataService } from '../../core/http/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { FlowDiscountRequest, inr } from '../models/appointment-flow.model';
import { ApiRoutesConstants } from './api-route-constants';
import { NotificationService } from './notification.service';

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

  readonly pending = signal<FlowDiscountRequest[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.refresh();
  };

  /** Starts polling (once); safe to call again. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.refresh(), POLL_MS);
    document.addEventListener('visibilitychange', this.onVisible);
    this.refresh();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisible);
    this.clear();
  }

  /** Reads the waiting requests now (also called right after a decision so the bell updates at once). */
  refresh(force = false): void {
    if (!this.auth.isAuthenticated()) return this.stop();
    if (!this.auth.hasActionAccess(APPROVE_DISCOUNT_ACTION)) return this.clear();
    if (!force && document.visibilityState === 'hidden') return;

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
        if (fresh > 0) {
          Swal.fire({
            toast: true, position: 'top-end', icon: 'info', title: fresh === 1 ? 'Discount approval needed' : `${fresh} discount requests need approval`,
            text: 'Open the notification bell to review.', showConfirmButton: false, timer: 6000, timerProgressBar: true,
          });
        }
      },
      error: () => undefined, // the next tick simply tries again
    });
  }

  private clear(): void {
    if (this.pending().length) this.pending.set([]);
    this.notifications.syncDiscountRequests([]);
  }
}
