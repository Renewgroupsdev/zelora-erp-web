import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { TabAttentionService } from './tab-attention.service';

interface ReminderTicket {
  ticket_number: string; title: string; priority: string; priority_label: string; status_label: string;
  reporter: string; mine: boolean; is_overdue: boolean; created_at: string;
}
interface ReminderResponse { enabled: boolean; interval_minutes: number; total: number; tickets: ReminderTicket[]; }

const TICK_MS = 60_000;
const DEFAULT_INTERVAL = 15;

/**
 * The repeating "tickets waiting for you" pop-up. While a ticket assigned to this login (or, for the queue receivers, an unassigned
 * one) still needs action, the pop-up shows again every N minutes - N and the on/off switch are the Help Desk settings, and the API
 * only returns tickets to roles holding "Receive Support Ticket Reminder Pop-ups". The time of the last pop-up is kept per login in
 * localStorage, so a page reload or a second tab does not repeat it early. "Later" simply waits for the next interval.
 */
@Injectable({ providedIn: 'root' })
export class SupportReminderService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly tabAttention = inject(TabAttentionService);
  private timer: ReturnType<typeof setInterval> | undefined;
  private intervalMin = DEFAULT_INTERVAL;
  private busy = false;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.check(), TICK_MS);
    setTimeout(() => this.check(), 4000); // let the session and the first page settle
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private key(): string {
    return `support-reminder-last:${this.auth.currentUser()?.id ?? 'x'}`;
  }

  private last(): number {
    try { return Number(localStorage.getItem(this.key())) || 0; } catch { return 0; }
  }

  private setLast(at: number): void {
    try { localStorage.setItem(this.key(), String(at)); } catch { /* storage blocked: the interval restarts on reload */ }
  }

  private check(): void {
    if (this.busy || !this.auth.isAuthenticated()) return;
    if (document.visibilityState === 'hidden') return;
    if (Date.now() - this.last() < this.intervalMin * 60_000) return;
    // never cover another dialog / alert the user is working in
    if (Swal.isVisible() || document.querySelector('.mat-mdc-dialog-container')) return;

    this.busy = true;
    this.http.get<any>(`${environment.apiBaseUrl}support/reminders`).subscribe({
      next: async (res) => {
        const r: ReminderResponse = res?.data;
        if (r) this.intervalMin = r.interval_minutes || DEFAULT_INTERVAL;
        this.setLast(Date.now());
        if (!r?.enabled || !r.tickets.length) { this.busy = false; return; }
        try { await this.show(r); } finally { this.busy = false; }
      },
      error: () => { this.busy = false; }, // try again on the next tick
    });
  }

  private async show(r: ReminderResponse): Promise<void> {
    const rows = r.tickets.slice(0, 3).map((t, i) => `
      <div class="ua-item" style="animation-delay:${0.25 + i * 0.12}s">
        <i class="bi bi-headset"></i>
        <span><b>${this.esc(t.ticket_number)} &middot; ${this.esc(t.title)}</b><small>${this.esc(t.reporter)} &middot; ${this.esc(t.priority_label)}${t.is_overdue ? ' &middot; Overdue' : ''} &middot; ${this.esc(t.status_label)}${t.mine ? '' : ' &middot; Unassigned'}</small></span>
      </div>`).join('');
    const more = r.total > 3 ? `<div class="ua-more">+ ${r.total - 3} more waiting</div>` : '';
    const title = r.total === 1 ? 'Support ticket waiting for you' : `${r.total} support tickets waiting for you`;
    this.tabAttention.attention(title, r.tickets.slice(0, 3).map((t) => t.ticket_number).join(', '));

    const res = await Swal.fire({
      showCancelButton: true, allowOutsideClick: false, focusConfirm: true,
      confirmButtonText: '<i class="bi bi-eye-fill"></i> ' + (r.total === 1 ? 'Open ticket' : 'View tickets'), cancelButtonText: 'Later',
      showClass: { popup: 'ua-pop-in' }, hideClass: { popup: 'ua-pop-out' },
      customClass: { popup: 'ua-card', htmlContainer: 'ua-html', confirmButton: 'urgent-alert-btn', cancelButton: 'urgent-alert-btn' },
      html: `
        <div class="ua-head">
          <span class="ua-badge"><span class="ua-ring"></span><i class="bi bi-headset"></i></span>
          <div><div class="ua-title">${this.esc(title)}</div><div class="ua-sub">These tickets still need your action. This reminder repeats every ${r.interval_minutes} minutes until they are resolved.</div></div>
        </div>
        <div class="ua-list">${rows}${more}</div>`,
    });
    if (!res.isConfirmed) return;
    if (r.total === 1) void this.router.navigate(['/app/support/admin/tickets', r.tickets[0].ticket_number]);
    else void this.router.navigate(['/app/support/tickets'], { queryParams: { scope: 'assigned' } });
  }

  private esc(v: unknown): string {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
