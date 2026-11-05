import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/auth/auth.service';
import { TelephonyService } from '../../core/telephony/telephony.service';
import { openAssignCaller } from '../components/lead-dialogs/assign-caller-dialog';
import { AlertStackItem, AlertStackService } from './alert-stack.service';
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
  private readonly alertStack = inject(AlertStackService);
  private readonly dialog = inject(MatDialog);

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
        // one card per absent telecaller, sliding in one below the other
        this.alertStack.show(...fresh.map((a): AlertStackItem => {
          const onLeave = a.state === 'on_leave';
          return {
            tone: 'warning',
            icon: 'bi-person-x-fill',
            title: `${a.telecaller_name} is ${onLeave ? 'on leave' : 'absent'} today`,
            text: 'Their leads need another telecaller - reassign them now.',
            chips: [`${a.leads_count} lead${a.leads_count === 1 ? '' : 's'}`, ...(a.due_today ? [`${a.due_today} due today`] : [])],
            duration: 9000,
            actionLabel: 'Reassign',
            onAction: () => openAssignCaller(this.dialog, {
              leadIds: a.lead_ids,
              subject: `${a.lead_ids.length} lead${a.lead_ids.length === 1 ? '' : 's'} of ${a.telecaller_name} (${onLeave ? 'on leave' : 'absent'} today)`,
              currentId: a.telecaller_id,
              currentName: a.telecaller_name,
            }).afterClosed().subscribe(saved => saved && this.refresh(true)),
          };
        }));
      },
      error: () => undefined, // the next tick simply tries again
    });
  }
}
