import { Injectable, inject } from '@angular/core';
import Swal from 'sweetalert2';
import { ApiDataService } from '../../core/http/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from './notification.service';

const POLL_MS = 30_000;

/**
 * Purchase requests waiting for the head office, shown in the bell as notifications. A branch "Send Request" lands here for every
 * signed-in approver (head office / admin). The API says who may approve (`can_approve` on the list), so a role that cannot simply sees nothing.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseApprovalAlertsService {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.refresh(), POLL_MS);
    this.refresh();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.notifications.syncPurchaseApprovals([]);
    this.notifications.syncPriceRevisions([]);
  }

  refresh(): void {
    if (!this.auth.isAuthenticated()) return this.stop();
    if (document.visibilityState === 'hidden') return;

    this.api.GET('purchase/requests?status=Pending&per_page=20').subscribe({
      next: (res: any) => {
        if (!res?.can_approve) return void this.notifications.syncPurchaseApprovals([]);
        const fresh = this.notifications.syncPurchaseApprovals(((res.data ?? []) as any[]).map(r => ({
          id: String(r.id), requestNo: r.request_no, branch: r.branch?.name ?? 'a branch', items: Number(r.items_count) || 0,
          by: r.requested_by ?? 'A branch', at: r.requested_at ? new Date(r.requested_at) : new Date(),
        })));
        if (fresh > 0) {
          Swal.fire({
            toast: true, position: 'top-end', icon: 'info', title: fresh === 1 ? 'Purchase request needs approval' : `${fresh} purchase requests need approval`,
            text: 'Open the notification bell to review.', showConfirmButton: false, timer: 6000, timerProgressBar: true,
          });
        }
      },
      error: () => undefined,
    });

    // vendor price revisions waiting for the admin (the API returns nothing for roles that cannot accept them)
    this.api.GET('purchase/price-revisions').subscribe({
      next: (res: any) => {
        const fresh = this.notifications.syncPriceRevisions(((res?.data?.items ?? []) as any[]).map(r => ({
          id: r.id, poNo: r.po_no ?? 'a purchase order', vendor: r.vendor_name ?? 'The vendor', items: Number(r.items) || 0,
          by: r.submitted_by ?? 'purchase', at: r.submitted_at ? new Date(r.submitted_at) : new Date(),
        })));
        if (fresh > 0) {
          Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Vendor price revision needs approval', text: 'Open the notification bell to review.', showConfirmButton: false, timer: 6000, timerProgressBar: true });
        }
      },
      error: () => undefined,
    });
  }
}
