import { Injectable, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertStackService } from './alert-stack.service';
import { ApiRoutesConstants } from './api-route-constants';
import { BellRealtimeService } from './bell-realtime.service';
import { NotificationService } from './notification.service';

const POLL_MS = 30_000;
/** Only these logins get the manpower budget-approval alert. */
const APPROVER_ROLES = ['super_admin', 'admin', 'hr'];

/**
 * Manpower requests waiting for budget approval, shown in the notification bell (and as an alert card when a new one
 * arrives) for HR, Admin and Super Admin only - it used to be a banner on the Recruitment page.
 */
@Injectable({ providedIn: 'root' })
export class ManpowerApprovalAlertsService {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly alertStack = inject(AlertStackService);
  private readonly realtime = inject(BellRealtimeService);
  private timer: ReturnType<typeof setInterval> | null = null;
  private live?: Subscription;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.refresh(), POLL_MS);
    // the bell's socket reconnecting re-reads everything once; a request approved / rejected meanwhile drops out on the poll
    this.live = this.realtime.topic$.subscribe(t => { if (t === 'all') this.refresh(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refresh(); });
    this.refresh();
    setTimeout(() => this.refresh(), 1500); // the first call can run before the session is ready
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.live?.unsubscribe();
    this.live = undefined;
    this.notifications.syncManpowerApprovals([]);
  }

  private mayApprove(): boolean {
    const slug = this.auth.currentUser()?.role?.slug ?? '';
    return APPROVER_ROLES.includes(slug) && this.auth.hasActionAccess('approve-manpower-request');
  }

  refresh(): void {
    if (!this.auth.isAuthenticated()) return this.stop();
    if (document.visibilityState === 'hidden') return;
    if (!this.mayApprove()) {
      this.notifications.syncManpowerApprovals([]);
      return;
    }

    this.api.GET(`${ApiRoutesConstants.HR_MANPOWER}?status[]=Pending&per_page=50`).subscribe({
      next: (res: any) => {
        const rows: any[] = res?.data?.data ?? res?.data ?? [];
        const fresh = this.notifications.syncManpowerApprovals(rows.map(r => ({
          id: Number(r.id),
          requestNo: String(r.request_no ?? ''),
          designation: String(r.designation ?? ''),
          branch: String(r.branch?.name ?? ''),
          positions: Number(r.positions ?? 1),
          by: String(r.requested_by ?? 'A branch'),
          at: r.created_at ? new Date(r.created_at) : new Date(),
        })));
        if (fresh > 0) {
          this.alertStack.show({
            tone: 'info', icon: 'bi-person-plus-fill', duration: 9000, key: 'manpower-approval', replace: true,
            title: fresh === 1 ? 'Manpower request waiting for budget approval' : `${fresh} manpower requests waiting for budget approval`,
            text: 'Open the notification bell and click it to review in Recruitment.',
          });
        }
      },
      error: () => { /* a role without access, or the API is down: the bell keeps what it has */ },
    });
  }
}
