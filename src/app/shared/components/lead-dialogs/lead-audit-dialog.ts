import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../common-services/api-route-constants';

interface LeadActivityRow {
  id: number | string;
  action: string;
  description: string;
  user: string | null;
  created_at: string;
  /** Appointment trail only: 'lead' (the enquiry before the visit) or 'appointment'. */
  stage?: 'lead' | 'appointment';
}

const ACTIONS: Record<string, { icon: string; tone: string; label: string }> = {
  created: { icon: 'bi-plus-circle', tone: 'green', label: 'Created' },
  enquiry: { icon: 'bi-chat-dots', tone: 'blue', label: 'Enquiry' },
  updated: { icon: 'bi-pencil', tone: 'blue', label: 'Edited' },
  assigned: { icon: 'bi-person-check', tone: 'orange', label: 'Assigned' },
  unassigned: { icon: 'bi-person-dash', tone: 'gray', label: 'Unassigned' },
  call_started: { icon: 'bi-telephone-outbound', tone: 'green', label: 'Call' },
  call_ended: { icon: 'bi-telephone-x', tone: 'gray', label: 'Call ended' },
  outcome: { icon: 'bi-journal-check', tone: 'purple', label: 'Outcome' },
  valid: { icon: 'bi-check2-circle', tone: 'green', label: 'Valid' },
  invalid: { icon: 'bi-x-octagon', tone: 'red', label: 'Invalid' },
  deleted: { icon: 'bi-trash3', tone: 'red', label: 'Deleted' },
  // Appointment steps (GET appointment-flow/{id}/activities)
  appointment_booked: { icon: 'bi-calendar-plus', tone: 'blue', label: 'Booked' },
  discount: { icon: 'bi-percent', tone: 'orange', label: 'Discount' },
  discount_approved: { icon: 'bi-patch-check', tone: 'green', label: 'Discount approved' },
  discount_rejected: { icon: 'bi-patch-exclamation', tone: 'red', label: 'Discount rejected' },
  terms: { icon: 'bi-chat-square-text', tone: 'blue', label: 'Terms' },
  terms_accepted: { icon: 'bi-check2-square', tone: 'green', label: 'Terms accepted' },
  cancelled: { icon: 'bi-calendar-x', tone: 'red', label: 'Cancelled' },
  invoice: { icon: 'bi-receipt', tone: 'purple', label: 'Invoice' },
  payment: { icon: 'bi-cash-coin', tone: 'green', label: 'Payment' },
  sitting: { icon: 'bi-heart-pulse', tone: 'purple', label: 'Sitting' },
  converted: { icon: 'bi-person-check', tone: 'green', label: 'Converted' },
  status: { icon: 'bi-arrow-left-right', tone: 'blue', label: 'Status' },
  consultation: { icon: 'bi-clipboard2-pulse', tone: 'orange', label: 'In consultation' },
  consultation_only: { icon: 'bi-clipboard2-check', tone: 'gray', label: 'Consultation only' },
  rescheduled: { icon: 'bi-calendar-week', tone: 'orange', label: 'Rescheduled' },
  step_profile: { icon: 'bi-person-vcard', tone: 'blue', label: 'Profile & history' },
  step_clinical: { icon: 'bi-clipboard2-pulse', tone: 'purple', label: 'Clinical exam' },
  step_treatment: { icon: 'bi-capsule', tone: 'purple', label: 'Treatment plan' },
  document_removed: { icon: 'bi-file-earmark-x', tone: 'gray', label: 'Document removed' },
  treatment_added: { icon: 'bi-plus-square', tone: 'green', label: 'New treatment' },
  sittings_added: { icon: 'bi-plus-circle', tone: 'green', label: 'Sittings added' },
  sitting_rescheduled: { icon: 'bi-calendar-week', tone: 'orange', label: 'Sitting rescheduled' },
  sitting_photos: { icon: 'bi-images', tone: 'blue', label: 'Sitting photos' },
  sitting_notes: { icon: 'bi-journal-medical', tone: 'purple', label: 'Doctor notes' },
};

/**
 * Audit trail. A lead's (GET customer-leads/{id}/activities) newest first; an appointment's
 * (GET appointment-flow/{id}/activities) start to end - the lead's enquiry, then the visit up to the latest sitting.
 */
@Component({
  selector: 'app-lead-audit-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, DatePipe],
  template: `
    <div class="la-dialog">
      <header class="la-head">
        <span class="la-icon"><i class="bi bi-clipboard-data"></i></span>
        <div>
          <h2>{{ data.kind === 'appointment' ? 'Activity tracking' : 'Audit log' }}</h2>
          <p>{{ data.name }} · {{ data.kind === 'appointment' ? 'AP' : 'LD' }}-{{ pad(data.id) }}
            @if (data.kind === 'appointment' && rows().length) { · {{ rows().length }} events, start to end }</p>
        </div>
        <button type="button" class="la-close" (click)="ref.close()" aria-label="Close"><i class="bi bi-x-lg"></i></button>
      </header>

      <div class="la-body">
        @if (loading()) {
          <p class="la-muted">Loading…</p>
        } @else if (error()) {
          <p class="la-muted la-error">{{ error() }}</p>
        } @else {
          <ol class="la-timeline">
            @for (a of rows(); track a.id; let i = $index, first = $first, last = $last) {
              <!-- Appointment trail: a heading where the lead's story ends and the visit begins -->
              @if (a.stage && (first || rows()[i - 1].stage !== a.stage)) {
                <li class="la-stage">
                  <i class="bi" [class]="a.stage === 'lead' ? 'bi-person-lines-fill' : 'bi-calendar2-check'"></i>
                  {{ a.stage === 'lead' ? 'Lead journey' : 'Appointment' }}
                </li>
              }
              <li [class]="'tone-' + meta(a.action).tone">
                <span class="la-dot"><i class="bi" [class]="meta(a.action).icon"></i></span>
                <div class="la-entry">
                  <div class="la-top">
                    <span class="la-tag">{{ meta(a.action).label }}</span>
                    @if (data.kind === 'appointment' && first) { <span class="la-mark start">Start</span> }
                    @if (data.kind === 'appointment' && last && !first) { <span class="la-mark latest">Latest</span> }
                    <time [attr.datetime]="a.created_at">{{ a.created_at | date: 'dd MMM yyyy, hh:mm a' }}</time>
                  </div>
                  <p>{{ a.description }}</p>
                  <small><i class="bi bi-person"></i> {{ a.user || 'System' }}</small>
                </div>
              </li>
            } @empty {
              <p class="la-muted">No activity recorded yet.</p>
            }
          </ol>
        }
      </div>
    </div>
  `,
  styles: [`
    .la-dialog { display: flex; flex-direction: column; max-height: 86vh; color: var(--text-dark); }
    .la-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid var(--border-soft);
      h2 { margin: 0; font-size: 17px; font-weight: 700; } p { margin: 2px 0 0; font-size: 12.5px; color: var(--text-muted); } }
    .la-icon { width: 40px; height: 40px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 12px; font-size: 18px;
      background: var(--status-purple-bg); color: var(--status-purple-text); }
    .la-close { margin-left: auto; border: 0; background: transparent; color: var(--text-muted); font-size: 16px; cursor: pointer; }
    .la-body { overflow-y: auto; padding: 14px 20px 18px; }
    .la-muted { margin: 16px 0; text-align: center; font-size: 12.5px; color: var(--text-muted); }
    .la-error { color: var(--status-red-text); }
    .la-timeline { list-style: none; margin: 0; padding: 0; position: relative;
      &::before { content: ''; position: absolute; left: 15px; top: 6px; bottom: 6px; width: 2px; background: var(--border-soft); }
      li { position: relative; display: flex; gap: 12px; padding-bottom: 14px; }
      li:last-child { padding-bottom: 0; } }
    .tone-green { --t-bg: var(--status-green-bg); --t-fg: var(--status-green-text); }
    .tone-blue { --t-bg: var(--status-blue-bg); --t-fg: var(--status-blue-text); }
    .tone-orange { --t-bg: var(--status-orange-bg); --t-fg: var(--status-orange-text); }
    .tone-purple { --t-bg: var(--status-purple-bg); --t-fg: var(--status-purple-text); }
    .tone-red { --t-bg: var(--status-red-bg); --t-fg: var(--status-red-text); }
    .tone-gray { --t-bg: var(--status-gray-bg); --t-fg: var(--status-gray-text); }
    .la-dot { position: relative; z-index: 1; width: 32px; height: 32px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%;
      font-size: 14px; background: var(--t-bg); color: var(--t-fg); box-shadow: 0 0 0 4px var(--app-surface-solid); }
    .la-entry { flex: 1; min-width: 0; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--border-soft);
      p { margin: 4px 0 2px; font-size: 12.5px; line-height: 1.4; word-break: break-word; }
      small { font-size: 11px; color: var(--text-muted); } }
    .la-top { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap;
      time { margin-left: auto; font-size: 11px; color: var(--text-muted); } }
    .la-timeline li.la-stage { z-index: 1; display: flex; align-items: center; gap: 6px; padding: 2px 0 10px;
      font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--primary-dark);
      i { width: 32px; height: 24px; display: grid; place-items: center; border-radius: 999px; font-size: 12px;
        background: var(--primary-soft); box-shadow: 0 0 0 4px var(--app-surface-solid); } }
    .la-mark { padding: 1px 7px; border-radius: 999px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
      &.start { background: var(--primary-soft); color: var(--primary-dark); }
      &.latest { background: var(--status-orange-bg); color: var(--status-orange-text); } }
    .la-tag { padding: 1px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; background: var(--t-bg); color: var(--t-fg); }
    @media (max-width: 480px) { .la-head, .la-body { padding-left: 14px; padding-right: 14px; } }
  `],
})
export class LeadAuditDialog {
  readonly data = inject<AuditSubject>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<LeadAuditDialog>);
  private readonly api = inject(ApiDataService);

  readonly rows = signal<LeadActivityRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    const base = this.data.kind === 'appointment' ? ApiRoutesConstants.APPOINTMENT_FLOW : ApiRoutesConstants.LEAD_ACTIVITIES;
    this.api.GET(`${base}/${this.data.id}/activities`).subscribe({
      next: (res: any) => { this.rows.set(res?.data ?? []); this.loading.set(false); },
      error: (err: any) => { this.error.set(err?.error?.message || 'Could not load the audit log.'); this.loading.set(false); },
    });
  }

  meta(action: string) {
    return ACTIONS[action] ?? { icon: 'bi-dot', tone: 'gray', label: action.replace(/_/g, ' ') };
  }

  pad(id: number): string {
    return String(id).padStart(5, '0');
  }
}

/** Whose trail to show: a lead (default) or an appointment (its visit steps + the lead's trail). */
export interface AuditSubject {
  id: number;
  name: string;
  kind?: 'lead' | 'appointment';
}

export function openLeadAudit(dialog: MatDialog, lead: AuditSubject): MatDialogRef<LeadAuditDialog> {
  return dialog.open(LeadAuditDialog, {
    width: '560px',
    maxWidth: 'calc(100vw - 24px)',
    autoFocus: false,
    panelClass: 'lead-audit-dialog',
    data: lead,
  });
}
