import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { ApiDataService } from '../../core/http/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AlertStackService } from './alert-stack.service';
import { NotificationService } from './notification.service';
import { PurchaseService } from './purchase.service';

const POLL_MS = 30_000;
/** A pending urgent request that was already alerted is alerted again after this long, until it is decided. */
const REMIND_MS = 45_000;
/** "Later" brings the urgent alert back after this long. */
const SNOOZE_MS = 45_000;
const SEEN_KEY = 'purchase-urgent-alerted';

/**
 * Purchase requests waiting for the head office, shown in the bell as notifications. A branch "Send Request" lands here for every
 * signed-in approver (head office / admin). The API says who may approve (`can_approve` on the list), so a role that cannot simply sees nothing.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseApprovalAlertsService {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly alertStack = inject(AlertStackService);
  private readonly dialog = inject(MatDialog);
  private readonly purchase = inject(PurchaseService);
  private queueRunning = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** True while the head office walks through the urgent requests: no new alert may cover the approve dialog. */
  readonly reviewing = signal(false);
  /**
   * "Review now": opens the approve / reject dialog of the alert's urgent request(s) over the current page, one by one. Approving or
   * rejecting moves on to the next; closing the dialog without a decision stops. Needs no page or route.
   */
  async openUrgentReview(alertIds: string[] = []): Promise<void> {
    if (this.queueRunning) return;
    this.queueRunning = true;
    this.reviewing.set(true);
    Swal.close();
    try {
      await this.purchase.reload('requests');
      const list = () => this.purchase.requests();
      const at = (id: string) => String(list().find(r => r.id === id)?.requestedAt);
      const ids = [...new Set([...alertIds, ...list().filter(r => r.status === 'Pending' && r.priority === 'Urgent').map(r => r.id)])]
        .filter(id => list().some(r => r.id === id && r.status === 'Pending'))
        .sort((x, y) => at(x).localeCompare(at(y)));
      if (!ids.length) {
        this.alertStack.show({ tone: 'info', title: 'No pending urgent request to review', duration: 4000 });
        return;
      }
      const { PurchaseRequestReview } = await import('../../pages/inventory/purchase/purchase-requests/purchase-request-review/purchase-request-review');
      for (let i = 0; i < ids.length; i++) {
        if (i > 0) await this.purchase.reload('requests');
        const current = list().find(r => r.id === ids[i]);
        if (!current || current.status !== 'Pending') continue; // decided meanwhile
        if (i > 0 && !(await this.showUrgent([{ requestNo: current.requestNo, branch: current.branch, items: current.items.length, by: current.requestedBy }], { index: i + 1, total: ids.length }))) {
          this.snooze();
          break;
        }
        const result = await firstValueFrom(this.dialog.open(PurchaseRequestReview, {
          width: '820px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, restoreFocus: true, disableClose: true,
          data: { requestId: ids[i], queue: ids.length > 1 ? { index: i + 1, total: ids.length } : undefined },
        }).afterClosed());
        if (!result) break;
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Could not open the urgent request', text: e instanceof Error ? e.message : 'Open it from the list.', confirmButtonColor: '#d97706' });
    } finally {
      this.queueRunning = false;
      this.reviewing.set(false);
      void this.purchase.reload('requests');
    }
  }

  /** "Later": the urgent alert comes back after 45 seconds. */
  snooze(): void {
    // count the 45 seconds from this click, so the 30 s poll in between does not bring it back early
    const now = Date.now();
    const seen = this.readSeen();
    for (const id of Object.keys(seen)) seen[id] = now;
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* storage blocked */ }
    setTimeout(() => this.refresh(), SNOOZE_MS + 500);
  }

  /** A check that was skipped (alert / dialog open, request failed) is repeated shortly instead of waiting for the next 30 s poll. */
  private retrySoon(): void {
    if (this.retry) return;
    this.retry = setTimeout(() => { this.retry = null; this.refresh(); }, 4000);
  }

  start(): void {
    if (this.timer) return;
    // a page load / login always alerts again for the urgent requests still waiting (while the app stays open, a pending urgent request is repeated every 45 seconds until it is decided)
    try { sessionStorage.removeItem(SEEN_KEY); } catch { /* storage blocked */ }
    this.timer = setInterval(() => this.refresh(), POLL_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refresh(); });
    this.refresh();
    setTimeout(() => this.refresh(), 1500); // the first call can run before the session is ready: check again almost at once
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
          by: r.requested_by ?? 'A branch', at: r.requested_at ? new Date(r.requested_at) : new Date(), urgent: r.priority === 'Urgent',
        })));
        const urgent = ((res.data ?? []) as any[]).filter(r => r.priority === 'Urgent');
        const due = this.dueUrgent(urgent.map(r => String(r.id)));
        // an alert is never stacked on the approve dialog or another alert; a request skipped here stays due for the next poll
        if (this.reviewing() || Swal.isVisible() || document.querySelector('.mat-mdc-dialog-container')) return void (due > 0 ? this.retrySoon() : undefined);
        if (due > 0) {
          this.markUrgent(urgent.map(r => String(r.id)));
          const ids = urgent.map(r => String(r.id));
          void this.showUrgent(urgent.map(r => ({ requestNo: r.request_no, branch: r.branch?.name ?? 'a branch', items: Number(r.items_count) || 0, by: r.requested_by ?? 'A branch' })))
            .then(ok => { if (ok) void this.openUrgentReview(ids); else this.snooze(); });
        } else if (fresh.fresh - fresh.urgent > 0) {
          this.alertStack.show({
            tone: 'info', icon: 'bi-cart-check-fill', duration: 9000,
            title: fresh.fresh - fresh.urgent === 1 ? 'Purchase request needs approval' : `${fresh.fresh - fresh.urgent} purchase requests need approval`,
            text: 'Open the notification bell to review.',
          });
        }
      },
      error: () => this.retrySoon(),
    });

    // vendor price revisions waiting for the admin (the API returns nothing for roles that cannot accept them)
    this.api.GET('purchase/price-revisions').subscribe({
      next: (res: any) => {
        const fresh = this.notifications.syncPriceRevisions(((res?.data?.items ?? []) as any[]).map(r => ({
          id: r.id, poNo: r.po_no ?? 'a purchase order', vendor: r.vendor_name ?? 'The vendor', items: Number(r.items) || 0,
          by: r.submitted_by ?? 'purchase', at: r.submitted_at ? new Date(r.submitted_at) : new Date(),
        })));
        if (fresh > 0) {
          this.alertStack.show({ tone: 'info', icon: 'bi-tag-fill', duration: 9000, title: 'Vendor price revision needs approval', text: 'Open the notification bell to review.' });
        }
      },
      error: () => undefined,
    });
  }
  /** How many of the pending urgent requests were never alerted, or not within the last REMIND_MS. */
  private dueUrgent(ids: string[]): number {
    const seen = this.readSeen();
    const now = Date.now();
    return ids.filter(id => now - (seen[id] ?? 0) > REMIND_MS).length;
  }

  private markUrgent(ids: string[]): void {
    const now = Date.now();
    // only the ids still pending are kept, so the record never grows
    const next: Record<string, number> = {};
    for (const id of ids) next[id] = now;
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* storage blocked: the alert simply repeats */ }
  }

  private readSeen(): Record<string, number> {
    try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, number>; } catch { return {}; }
  }
  /**
   * The "Urgent stock request" card: an amber header with the warning badge, then the waiting request(s). Resolves true on "Review now",
   * and only after the card has fully closed, so whatever opens next never sits under it.
   */
  async showUrgent(list: { requestNo: string; branch: string; items: number; by: string }[], position?: { index: number; total: number }): Promise<boolean> {
    const rows = list.slice(0, 3).map((r, i) => `
      <div class="ua-item" style="animation-delay:${0.25 + i * 0.12}s">
        <i class="bi bi-box-seam-fill"></i>
        <span><b>${this.esc(r.requestNo)}</b><small>${this.esc(r.branch)} &middot; ${this.esc(r.by)}</small></span>
        <em>${r.items} product${r.items === 1 ? '' : 's'}</em>
      </div>`).join('');
    const more = list.length > 3 ? `<div class="ua-more">+ ${list.length - 3} more urgent request${list.length - 3 === 1 ? '' : 's'}</div>` : '';
    const title = position ? `Urgent request ${position.index} of ${position.total}` : list.length === 1 ? 'Urgent stock request' : `${list.length} urgent stock requests`;

    let closed!: () => void;
    const done = new Promise<void>(resolve => (closed = resolve));
    const res = await Swal.fire({
      showCancelButton: true, allowOutsideClick: false, focusConfirm: true,
      confirmButtonText: '<i class="bi bi-eye-fill"></i> Review now', cancelButtonText: 'Later',
      showClass: { popup: 'ua-pop-in' }, hideClass: { popup: 'ua-pop-out' },
      customClass: { popup: 'ua-card', htmlContainer: 'ua-html', confirmButton: 'urgent-alert-btn', cancelButton: 'urgent-alert-btn' },
      html: `
        <div class="ua-head">
          <span class="ua-badge"><span class="ua-ring"></span><i class="bi bi-exclamation-triangle-fill"></i></span>
          <div><div class="ua-title">${this.esc(title)}</div><div class="ua-sub">A branch needs stock urgently. Check nearby branch stock or the vendor quotes now.</div></div>
        </div>
        <div class="ua-list">${rows}${more}</div>`,
      didClose: () => closed(),
    });
    // didClose normally fires within ~200 ms; the timeout only guards against a close that never reports
    await Promise.race([done, new Promise<void>(resolve => setTimeout(resolve, 700))]);
    return res.isConfirmed;
  }

  private esc(v: unknown): string {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
