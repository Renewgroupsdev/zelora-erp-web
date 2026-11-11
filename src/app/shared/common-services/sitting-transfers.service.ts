import { Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ApiDataService } from '../../core/http/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { SittingTransfer } from '../models/appointment-flow.model';
import { ApiRoutesConstants } from './api-route-constants';
import { AlertStackService } from './alert-stack.service';
import { NotificationService } from './notification.service';
import { SittingTransferDialog } from '../components/sitting-transfer-dialog/sitting-transfer-dialog';

/** Roles & Permissions -> Appointment module action: who may accept / decline a sitting moved to their branch (the API checks the same). */
export const DECIDE_TRANSFER_ACTION = 'sitting-transfer-decide';

const POLL_MS = 8_000;

/**
 * Sitting transfer requests waiting for the signed-in manager's branch. Polled like discount requests: a new one
 * shows a card ("Review") and a bell notification; accepted / declined by anyone, it drops out on the next poll.
 */
@Injectable({ providedIn: 'root' })
export class SittingTransfersService {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly alertStack = inject(AlertStackService);
  private readonly dialog = inject(MatDialog);

  readonly pending = signal<SittingTransfer[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.refresh();
  };

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

  /** Opens the accept / decline dialog; the list refreshes when it closes. */
  review(transfer: SittingTransfer): void {
    this.dialog
      .open(SittingTransferDialog, { width: '640px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, restoreFocus: true, data: { transfer } })
      .afterClosed().subscribe(() => this.refresh(true));
  }

  refresh(force = false): void {
    if (!this.auth.isAuthenticated()) return this.stop();
    if (!this.auth.hasActionAccess(DECIDE_TRANSFER_ACTION)) return this.clear();
    if (!force && document.visibilityState === 'hidden') return;

    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/sitting-transfers`).subscribe({
      next: (res: any) => {
        const list = (res?.data ?? []) as SittingTransfer[];
        this.pending.set(list);
        const fresh = this.notifications.syncSittingTransfers(list);
        this.alertStack.show(...fresh.slice(0, 4).map(r => ({
          tone: 'info' as const, icon: 'bi-arrow-left-right',
          title: 'Sitting transfer request',
          text: `${r.from_branch} asks your branch to take sitting ${r.sitting_no} of ${r.customer ?? 'a customer'}. Accept or reject.`,
          chips: [`${r.scheduled_date} ${r.scheduled_time ?? ''}`.trim()],
          duration: 9000, actionLabel: 'Accept / Reject',
          onAction: () => this.review(r),
        })));
      },
      error: () => undefined,
    });
  }

  private clear(): void {
    if (this.pending().length) this.pending.set([]);
    this.notifications.syncSittingTransfers([]);
  }
}
