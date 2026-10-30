import { Injectable, inject } from '@angular/core';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/auth/auth.service';
import { TelephonyService } from '../../core/telephony/telephony.service';
import { NotificationService } from './notification.service';

/** Roles & Permissions -> Lead Management action: who may hand a lead to another telecaller (the API checks the role too). */
export const ASSIGN_CALLER_ACTION = 'assign-lead-caller';

const POLL_MS = 5 * 60_000;

/**
 * "Telecaller absent today" alerts for the branch manager: telecallers of their branch / franchise who are absent (HR
 * attendance) but still hold open leads show in the bell, and clicking one opens Assign Caller for all those leads.
 * Polled every few minutes (attendance changes slowly); only runs for a role ticked on "Assign / Reassign Caller".
 */
@Injectable({ providedIn: 'root' })
export class AbsentTelecallersService {
  private readonly auth = inject(AuthService);
  private readonly telephony = inject(TelephonyService);
  private readonly notifications = inject(NotificationService);

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
    this.notifications.syncAbsentTelecallers([]);
  }

  refresh(force = false): void {
    if (!this.auth.isAuthenticated()) return this.stop();
    if (!this.auth.hasActionAccess(ASSIGN_CALLER_ACTION)) return void this.notifications.syncAbsentTelecallers([]);
    if (!force && document.visibilityState === 'hidden') return;

    this.telephony.absentAlerts().subscribe({
      next: alerts => {
        const fresh = this.notifications.syncAbsentTelecallers(alerts);
        if (fresh > 0) {
          Swal.fire({
            toast: true, position: 'top-end', icon: 'warning',
            title: fresh === 1 ? `${alerts[0].telecaller_name} is absent today` : `${fresh} telecallers are absent today`,
            text: 'Their leads need another telecaller - open the notification bell to reassign.',
            showConfirmButton: false, timer: 7000, timerProgressBar: true,
          });
        }
      },
      error: () => undefined, // the next tick simply tries again
    });
  }
}
