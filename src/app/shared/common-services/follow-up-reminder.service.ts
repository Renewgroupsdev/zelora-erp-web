import { Injectable, inject } from '@angular/core';
import Swal from 'sweetalert2';
import { debounceTime } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { TelephonyService } from '../../core/telephony/telephony.service';
import { FollowUpLead } from '../../core/telephony/telephony.models';
import { ToastService } from './toast.service';

/** Roles & Permissions -> Follow-up action: who may call a follow-up lead (the reminder offers exactly that call). */
const CALL_ACTION = 'call-follow-up-lead';
const POLL_MS = 30_000;
/** The reminder opens this long before the scheduled call-back time. */
const LEAD_MINUTES = 5;
/** A call-back that is overdue by more than this is no longer reminded (it stays in the Follow-ups list). */
const OVERDUE_MINUTES = 30;
/** "Later" brings the reminder back after this long. */
const SNOOZE_MS = 45_000;

/**
 * Follow-up call reminder for the signed-in telecaller: 5 minutes before a lead assigned to them is due for a call-back, a card opens
 * on any page - "Call back" dials the lead right away (the card has no other button and cannot be dismissed). Once a call is started for a
 * lead the reminder stops for that call-back time (it returns only when a new follow-up time is saved).
 */
@Injectable({ providedIn: 'root' })
export class FollowUpReminderService {
  private readonly auth = inject(AuthService);
  private readonly telephony = inject(TelephonyService);
  private readonly toast = inject(ToastService);

  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  /** lead id + call-back time -> do not remind again (the call was started). */
  private readonly handled = new Set<string>();
  /** lead id + call-back time -> remind again after this moment ("Later"). */
  private readonly snoozed = new Map<string, number>();

  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') void this.refresh();
  };

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
    document.addEventListener('visibilitychange', this.onVisible);
    // a saved call outcome / a lead assigned to me changes the call-back times: look again at once instead of at the next poll
    this.telephony.outcomeSaved$.pipe(debounceTime(1500)).subscribe(() => void this.refresh());
    this.telephony.leadChanged$.pipe(debounceTime(1500)).subscribe(() => void this.refresh());
    setTimeout(() => void this.refresh(), 3000); // the session and telephony state are ready a moment after login
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  async refresh(): Promise<void> {
    if (!this.auth.isAuthenticated()) return this.stop();
    if (this.busy || document.visibilityState === 'hidden' || !this.auth.hasActionAccess(CALL_ACTION)) return;
    // never stack on a call in progress, another alert or an open dialog; the next poll tries again
    if (this.telephony.onCall() || Swal.isVisible() || document.querySelector('.mat-mdc-dialog-container')) {
      console.debug('[follow-up reminder] waiting: a call, alert or dialog is open');
      return;
    }

    const me = Number(this.auth.currentUser()?.id);
    if (!me) return;

    this.busy = true;
    try {
      const { leads } = await new Promise<{ leads: FollowUpLead[] }>((resolve, reject) =>
        this.telephony.followupQueue({ per_page: 100 }).subscribe({ next: resolve, error: reject }));

      const now = Date.now();
      const due = leads
        .filter(l => Number(l.assigned_to) === me && l.next_follow_up_at && !l.on_call && l.mobile_no)
        .map(l => ({ lead: l, at: new Date(l.next_follow_up_at as string).getTime() }))
        .filter(x => !Number.isNaN(x.at) && (x.at - now) / 60_000 <= LEAD_MINUTES && (x.at - now) / 60_000 >= -OVERDUE_MINUTES)
        .filter(x => !this.handled.has(this.key(x.lead)) && (this.snoozed.get(this.key(x.lead)) ?? 0) <= now)
        .sort((a, b) => a.at - b.at);

      if (!due.length) {
        const next = leads.filter(l => Number(l.assigned_to) === me && l.next_follow_up_at).map(l => new Date(l.next_follow_up_at as string).getTime()).filter(t => t > now).sort((a, b) => a - b)[0];
        console.debug('[follow-up reminder] nothing due within', LEAD_MINUTES, 'min.', next ? `Next call-back ${new Date(next).toLocaleString()} (reminder at ${new Date(next - LEAD_MINUTES * 60_000).toLocaleTimeString()}).` : 'No upcoming call-back.');
        return;
      }
      await this.show(due[0].lead, due[0].at, due.length - 1);
    } catch {
      // the next poll simply tries again
    } finally {
      this.busy = false;
    }
  }

  private key(lead: FollowUpLead): string {
    return `${lead.id}|${lead.next_follow_up_at}`;
  }

  private async show(lead: FollowUpLead, at: number, more: number): Promise<void> {
    const minutes = Math.round((at - Date.now()) / 60_000);
    const when = new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const message = minutes > 1 ? `Your call-back is due in ${minutes} minutes.`
      : minutes === 1 ? 'Your call-back is due in 1 minute.'
      : minutes >= 0 ? 'Your call-back is due now.'
      : `Your call-back was due ${-minutes} minute${minutes === -1 ? '' : 's'} ago.`;
    const code = `LD-${String(lead.id).padStart(5, '0')}`;

    let closed!: () => void;
    const done = new Promise<void>(resolve => (closed = resolve));
    const res = await Swal.fire({
      didClose: () => closed(),
      showCancelButton: false, allowOutsideClick: false, allowEscapeKey: false, focusConfirm: true,
      confirmButtonText: '<i class="bi bi-telephone-outbound-fill"></i> Call back',
      showClass: { popup: 'ua-pop-in' }, hideClass: { popup: 'ua-pop-out' },
      customClass: { popup: 'ua-card', htmlContainer: 'ua-html', confirmButton: 'urgent-alert-btn', cancelButton: 'urgent-alert-btn' },
      html: `
        <div class="ua-head">
          <span class="ua-badge"><span class="ua-ring"></span><i class="bi bi-alarm-fill"></i></span>
          <div><div class="ua-title">Follow-up call due</div><div class="ua-sub">${this.esc(message)} Call the lead back now to keep the follow-up on schedule.</div></div>
        </div>
        <div class="ua-list">
          <div class="ua-item">
            <i class="bi bi-person-lines-fill"></i>
            <span><b>${this.esc(lead.name)}</b><small>${this.esc(code)} &middot; ${this.esc(lead.mobile_no)}${lead.service_category_name ? ' &middot; ' + this.esc(lead.service_category_name) : ''}</small></span>
            <em>${this.esc(when)}</em>
          </div>
          ${more > 0 ? `<div class="ua-more">+ ${more} more call-back${more === 1 ? '' : 's'} due soon</div>` : ''}
        </div>`,
    });

    // Wait until the card has fully closed: the call-outcome popup opens as soon as the call connects, and one opened while this
    // card is still leaving sits under it / loses focus. (didClose normally fires within ~200 ms; the timeout only guards a close that never reports.)
    await Promise.race([done, new Promise<void>(resolve => setTimeout(resolve, 700))]);

    const key = this.key(lead);
    if (res.isConfirmed) {
      this.handled.add(key);
      this.telephony.dial({ phone_number: lead.mobile_no }).subscribe({
        // Same flow as the Call button in the Follow-ups table: the call card appears; its Note button opens the outcome popup.
        error: (err: any) => {
          this.handled.delete(key); // the call did not start: remind again
          this.toast.error(err?.error?.message || 'Unable to start the call.');
        },
      });
    } else {
      // There is no "Later" button: the card only closes by "Call back". If something else closed it (another part of the app
      // calling Swal.close()), it comes back after 45 seconds.
      this.snoozed.set(key, Date.now() + SNOOZE_MS);
      setTimeout(() => void this.refresh(), SNOOZE_MS + 500);
    }
  }

  private esc(v: unknown): string {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
