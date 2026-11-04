import { CommonModule, formatDate } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { EMPTY, Observable, catchError, expand, forkJoin, of, reduce, switchMap } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../common-services/api-route-constants';
import { AuditService } from '../../common-services/audit.service';
import { AuditChange, AuditEvent, AuditOrigin } from '../../models/audit.model';
import { OUTCOME_LABEL, actorInitials, auditError, dayHeading, eventMeta, sourceLabel } from '../../../pages/audit/audit-meta';

export interface RecordAuditData {
  /** Audited model name as the backend stores it (class basename, e.g. "Branch", "CustomerLead"). */
  type: string;
  recordId: string | number;
  title?: string;
}

/** One line of the timeline: an audit event, or (leads) a lead activity such as Created / Enquiry / Call. */
interface TimelineRow {
  id: string;
  at: string;
  atDisplay: string;
  tone: string;
  icon: string;
  tag: string;
  bad?: string;
  description: string;
  changes: AuditChange[];
  fields: string[];
  actor: string;
  role: string | null;
  branch: string | null;
  source: string | null;
}

interface LeadActivity { id: number | string; action: string; description: string; user: string | null; created_at: string }

const LEAD_ACTIONS: Record<string, { icon: string; tone: string; label: string }> = {
  created: { icon: 'bi-plus-circle-fill', tone: 'green', label: 'Created' },
  enquiry: { icon: 'bi-chat-dots-fill', tone: 'blue', label: 'Enquiry' },
  assigned: { icon: 'bi-person-check-fill', tone: 'orange', label: 'Assigned' },
  unassigned: { icon: 'bi-person-dash-fill', tone: 'gray', label: 'Unassigned' },
  call_started: { icon: 'bi-telephone-outbound-fill', tone: 'green', label: 'Call' },
  call_ended: { icon: 'bi-telephone-x-fill', tone: 'gray', label: 'Call ended' },
  outcome: { icon: 'bi-journal-check', tone: 'purple', label: 'Outcome' },
  valid: { icon: 'bi-check2-circle', tone: 'green', label: 'Valid' },
  invalid: { icon: 'bi-x-octagon-fill', tone: 'red', label: 'Invalid' },
  deleted: { icon: 'bi-trash3-fill', tone: 'red', label: 'Deleted' },
};

/**
 * Audit log of one record, for every module: a day-grouped timeline of everything that happened to it
 * (created, edited, deleted ...) with who did it, from where, and each field's before / after. Read-only; the API
 * enforces permission, branch scope and value redaction, this dialog only draws what comes back.
 */
@Component({
  selector: 'app-record-audit-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  template: `
    <div class="ra">
      <header class="ra-head">
        <span class="ra-icon"><i class="bi bi-clipboard-data"></i></span>
        <div class="ra-titles">
          <h2>Audit log</h2>
          <p><b>{{ data.title || 'Record' }}</b> · {{ typeLabel() }}@if (showId()) { · ID {{ data.recordId }} }</p>
        </div>
        @if (events().length) {
          <span class="ra-count" title="Total events"><i class="bi bi-activity"></i> {{ events().length }} {{ events().length === 1 ? 'event' : 'events' }}</span>
        }
        <button type="button" class="ra-close" (click)="ref.close()" aria-label="Close"><i class="bi bi-x-lg"></i></button>
      </header>

      <div class="ra-body">
        @if (loading() && !events().length) {
          <div class="ra-state"><i class="bi bi-arrow-repeat spin"></i> Loading audit log…</div>
        } @else if (error()) {
          <div class="ra-state err">
            <i class="bi bi-exclamation-triangle"></i>
            <span>{{ error() }}</span>
            <button type="button" class="ra-link" (click)="load()">Try again</button>
          </div>
        } @else if (!events().length) {
          <div class="ra-state col">
            <i class="bi bi-inbox"></i>
            <span>No changes have been recorded for this record yet.</span>
            <small>Tracking starts at a record's first create or edit. Records added before audit tracking began show their history from the first change made after that.</small>
          </div>
        } @else {
          @if (!hasCreated()) {
            <div class="ra-note"><i class="bi bi-info-circle"></i> Created before audit tracking began: history starts from the first recorded change.</div>
          }
          @for (g of groups(); track g.key) {
            <div class="ra-day"><span>{{ g.label }}</span></div>
            <ol class="ra-timeline">
              @for (e of g.rows; track e.id) {
                <li [class]="'tone-' + e.tone">
                  <span class="ra-dot"><i class="bi" [class]="e.icon"></i></span>
                  <article class="ra-entry">
                    <div class="ra-top">
                      <span class="ra-tag">{{ e.tag }}</span>
                      @if (e.bad) { <span class="ra-bad">{{ e.bad }}</span> }
                      <time [attr.datetime]="e.at">{{ e.atDisplay }}</time>
                    </div>

                    <p class="ra-desc">{{ e.description }}</p>

                    @if (e.changes.length) {
                      <ul class="ra-changes">
                        @for (c of e.changes; track c.field) {
                          <li>
                            <span class="ra-field">{{ c.label }}</span>
                            @if (c.masked) {
                              <span class="ra-hidden"><i class="bi bi-eye-slash"></i> Hidden</span>
                            } @else {
                              <span class="ra-old" [class.none]="!c.old">{{ c.old || 'empty' }}</span>
                              <i class="bi bi-arrow-right"></i>
                              <span class="ra-new" [class.none]="!c.new">{{ c.new || 'empty' }}</span>
                            }
                          </li>
                        }
                      </ul>
                    } @else if (e.fields.length) {
                      <p class="ra-fields"><i class="bi bi-pencil-square"></i> {{ e.fields.join(', ') }}</p>
                    }

                    <footer class="ra-meta">
                      <span class="ra-actor">
                        <b>{{ initials(e.actor) }}</b>
                        {{ e.actor }}@if (e.role) { <em>· {{ e.role }}</em> }
                      </span>
                      @if (e.branch) { <span><i class="bi bi-geo-alt"></i> {{ e.branch }}</span> }
                      @if (e.source) { <span><i class="bi bi-display"></i> {{ e.source }}</span> }
                    </footer>
                  </article>
                </li>
              }
            </ol>
          }

        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ra { display: flex; flex-direction: column; max-height: 88vh; color: var(--text-dark); }
    .ra-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid var(--border-soft); }
    .ra-icon { width: 42px; height: 42px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 13px; font-size: 19px;
      background: var(--status-purple-bg); color: var(--status-purple-text); }
    .ra-titles { flex: 1 1 auto; min-width: 0; }
    .ra-titles h2 { margin: 0; font-family: var(--font-family-display); font-size: 18px; font-weight: 800; }
    .ra-titles b { color: var(--text-dark); font-weight: 700; }
    .ra-titles p { margin: 2px 0 0; font-size: 12.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ra-count { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px;
      font-size: 11.5px; font-weight: 700; background: var(--primary-soft); color: var(--primary-dark); white-space: nowrap; }
    .ra-close { flex: 0 0 auto; width: 32px; height: 32px; border: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
      background: var(--app-surface-soft); color: var(--text-muted); transition: background .15s ease, color .15s ease; }
    .ra-close:hover { background: var(--status-red-bg); color: var(--status-red-text); }
    .ra-body { overflow-y: auto; padding: 8px 20px 20px; scrollbar-width: thin; }

    .ra-state { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 42px 12px; font-size: 13px; color: var(--text-muted); }
    .ra-state.col { flex-direction: column; text-align: center; }
    .ra-state.col small { max-width: 420px; font-size: 11.5px; opacity: .85; }
    .ra-note { display: flex; gap: 8px; align-items: center; margin: 10px 0 0; padding: 8px 12px; border-radius: 10px; font-size: 12px;
      background: var(--status-blue-bg); color: var(--status-blue-text); }
    .ra-state.err { color: var(--status-red-text); }
    .ra-link { border: 0; background: transparent; color: var(--primary-dark); font-weight: 700; cursor: pointer; text-decoration: underline; }
    .spin { animation: ra-spin 1s linear infinite; }
    @keyframes ra-spin { to { transform: rotate(360deg); } }

    .ra-day { position: sticky; top: -8px; z-index: 2; margin: 14px 0 10px; padding: 4px 0; background: var(--app-surface-solid); }
    .ra-day span { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 10.5px; font-weight: 800; letter-spacing: .06em;
      text-transform: uppercase; background: var(--app-surface-soft); color: var(--text-muted); border: 1px solid var(--border-soft); }

    .ra-timeline { list-style: none; margin: 0; padding: 0; position: relative; }
    .ra-timeline::before { content: ''; position: absolute; left: 17px; top: 8px; bottom: 8px; width: 2px;
      background: linear-gradient(180deg, var(--border-soft-strong, var(--border-soft)), var(--border-soft)); }
    .ra-timeline > li { position: relative; display: flex; gap: 12px; padding-bottom: 12px; }
    .ra-timeline > li:last-child { padding-bottom: 2px; }

    .tone-green { --t-bg: var(--status-green-bg); --t-fg: var(--status-green-text); }
    .tone-teal { --t-bg: var(--status-green-bg); --t-fg: var(--status-green-text); }
    .tone-blue { --t-bg: var(--status-blue-bg); --t-fg: var(--status-blue-text); }
    .tone-orange { --t-bg: var(--status-orange-bg); --t-fg: var(--status-orange-text); }
    .tone-purple { --t-bg: var(--status-purple-bg); --t-fg: var(--status-purple-text); }
    .tone-red { --t-bg: var(--status-red-bg); --t-fg: var(--status-red-text); }
    .tone-gray { --t-bg: var(--status-gray-bg); --t-fg: var(--status-gray-text); }

    .ra-dot { position: relative; z-index: 1; width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%;
      font-size: 15px; background: var(--t-bg); color: var(--t-fg); box-shadow: 0 0 0 4px var(--app-surface-solid); }
    .ra-entry { flex: 1; min-width: 0; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--border-soft);
      background: var(--app-surface-solid); box-shadow: 0 6px 16px -14px rgba(16, 24, 40, .35); transition: box-shadow .15s ease, border-color .15s ease; }
    .ra-entry:hover { border-color: var(--border-soft-strong, var(--border-soft)); box-shadow: 0 10px 22px -14px rgba(16, 24, 40, .4); }
    .ra-top { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; }
    .ra-top time { margin-left: auto; font-size: 11.5px; color: var(--text-muted); }
    .ra-tag { padding: 2px 10px; border-radius: 999px; font-size: 10.5px; font-weight: 800; background: var(--t-bg); color: var(--t-fg); }
    .ra-bad { padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; background: var(--status-red-bg); color: var(--status-red-text); }
    .ra-desc { margin: 6px 0 2px; font-size: 13px; line-height: 1.45; word-break: break-word; }
    .ra-fields { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); }
    .ra-fields i { margin-right: 4px; }

    .ra-changes { list-style: none; margin: 8px 0 2px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
      border-radius: 10px; background: var(--app-surface-soft); border: 1px dashed var(--border-soft); }
    .ra-changes li { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; font-size: 12px; min-width: 0; }
    .ra-field { min-width: 92px; font-weight: 700; color: var(--text-muted); }
    .ra-old, .ra-new { max-width: 100%; padding: 1px 8px; border-radius: 6px; word-break: break-word; }
    .ra-old { background: var(--status-red-bg); color: var(--status-red-text); text-decoration: line-through; text-decoration-thickness: 1px; }
    .ra-new { background: var(--status-green-bg); color: var(--status-green-text); font-weight: 600; }
    .ra-old.none, .ra-new.none { font-style: italic; opacity: .75; text-decoration: none; }
    .ra-changes .bi-arrow-right { color: var(--text-muted); font-size: 11px; }
    .ra-hidden { color: var(--text-muted); font-style: italic; }

    .ra-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; padding-top: 8px;
      border-top: 1px solid var(--border-soft); font-size: 11.5px; color: var(--text-muted); }
    .ra-meta i.bi { margin-right: 3px; }
    .ra-actor { display: inline-flex; align-items: center; gap: 6px; color: var(--text-dark); font-weight: 600; }
    .ra-actor b { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; font-size: 9px; font-weight: 800;
      background: var(--primary-soft); color: var(--primary-dark); }
    .ra-actor em { font-style: normal; font-weight: 500; color: var(--text-muted); }

    .ra-more { display: flex; justify-content: center; padding-top: 8px; }
    .ra-btn { padding: 8px 18px; border: 1px solid var(--border-soft-strong, var(--border-soft)); border-radius: 10px; cursor: pointer;
      background: var(--app-surface-solid); color: var(--text-dark); font-size: 12.5px; font-weight: 700; }
    .ra-btn:hover:not(:disabled) { background: var(--app-surface-soft); color: var(--primary-dark); }
    .ra-btn:disabled { opacity: .6; cursor: default; }

    @media (max-width: 520px) {
      .ra-head, .ra-body { padding-left: 14px; padding-right: 14px; }
      .ra-count { display: none; }
      .ra-top time { margin-left: 0; width: 100%; }
    }
  `],
})
export class RecordAuditDialog {
  protected readonly data = inject<RecordAuditData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<RecordAuditDialog>>(MatDialogRef);
  private readonly audit = inject(AuditService);
  private readonly api = inject(ApiDataService);

  protected readonly events = signal<TimelineRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private readonly sampleType = signal<string | null>(null);

  protected readonly initials = actorInitials;
  /** Encrypted ids are long gibberish; only a plain numeric id is worth showing. */
  protected readonly showId = computed(() => /^\d+$/.test(String(this.data.recordId)));
  protected readonly hasCreated = computed(() => this.events().some(e => e.tag === 'Created'));
  protected readonly typeLabel = computed(() => this.sampleType() || this.data.type.replace(/([a-z])([A-Z])/g, '$1 $2'));
  protected readonly groups = computed(() => {
    const out: { key: string; label: string; rows: TimelineRow[] }[] = [];
    for (const e of this.events()) {
      const h = dayHeading(e.at);
      const last = out[out.length - 1];
      if (last?.key === h.key) last.rows.push(e);
      else out.push({ ...h, rows: [e] });
    }
    return out;
  });

  constructor() {
    this.load();
  }

  /** Whole life of the record, newest first: every audit event (with before / after) and, for a lead, its activity trail (Created, Enquiry, Calls ...). */
  protected load(): void {
    this.loading.set(true);
    this.error.set(null);

    const page = (n: number) => this.audit.history(this.data.type, this.data.recordId, { page: n, per_page: 100, detail: 1 });
    const audit$: Observable<AuditEvent[]> = page(1).pipe(
      expand(p => (p.pagination && p.pagination.current_page < p.pagination.last_page && p.pagination.current_page < 10 ? page(p.pagination.current_page + 1) : EMPTY)),
      reduce((all, p) => all.concat(p.data), [] as AuditEvent[]),
    );
    // The lead's own activity trail holds what the audit log cannot: its creation, enquiries and calls.
    const activities$: Observable<LeadActivity[]> = this.data.type === 'CustomerLead'
      ? this.api.GET(`${ApiRoutesConstants.LEAD_ACTIVITIES}/${this.data.recordId}/activities`).pipe(
          switchMap((res: any) => of((res?.data ?? []) as LeadActivity[])),
          catchError(() => of([] as LeadActivity[])),
        )
      : of([] as LeadActivity[]);

    // Records stored before audit tracking began have no "created" audit row: read the creation time / person from the record itself.
    const origin$: Observable<AuditOrigin | null> = this.data.type === 'CustomerLead'
      ? of(null)
      : this.audit.origin(this.data.type, this.data.recordId).pipe(catchError(() => of(null)));

    forkJoin([audit$, activities$, origin$]).subscribe({
      next: ([events, activities, origin]) => {
        this.sampleType.set(events[0]?.record.type_label ?? null);
        const rows = [...events.map(e => this.fromEvent(e)), ...activities.filter(a => a.action !== 'updated').map(a => this.fromActivity(a))];
        if (origin) {
          const tracked = events.some(e => e.event === 'created');
          // Skip a step the audit log already holds (an audited change within two minutes of it).
          const covered = (at: string) => events.some(e => Math.abs(Date.parse(e.occurred_at) - Date.parse(at)) < 120000);
          const steps = (origin.milestones ?? []).filter(s => !(tracked && s.own) && !(!s.own && covered(s.at)));
          steps.forEach((s, i) => rows.push({
            id: `m${i}`, at: s.at, atDisplay: s.at_display, tone: s.tone, icon: s.icon, tag: s.tag, description: s.description,
            changes: [], fields: [], actor: s.actor || 'System', role: s.role, branch: null, source: null,
          }));
          // A record with its own milestones already has its "Requested / Received ..." start; otherwise fall back to a plain Created entry.
          if (!tracked && !steps.some(s => s.own)) rows.push(this.fromOrigin(origin));
        }
        rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
        this.events.set(rows);
        this.loading.set(false);
      },
      error: err => { this.error.set(auditError(err).message); this.loading.set(false); },
    });
  }

  private fromEvent(e: AuditEvent): TimelineRow {
    const m = eventMeta(e.event);
    return {
      id: 'a' + e.id,
      at: e.occurred_at,
      atDisplay: e.occurred_at_display,
      tone: m.tone,
      icon: m.icon,
      tag: e.event_label,
      bad: e.outcome !== 'success' ? OUTCOME_LABEL[e.outcome] : undefined,
      description: e.description,
      changes: e.changes ?? [],
      fields: e.changed_field_labels ?? [],
      actor: e.actor.name || 'System',
      role: e.actor.role,
      branch: e.actor.branch,
      source: sourceLabel(e.source),
    };
  }

  private fromOrigin(o: AuditOrigin): TimelineRow {
    const who = o.created_by?.name || 'System';
    const what = this.typeLabel().toLowerCase();

    return {
      id: 'origin',
      at: o.created_at,
      atDisplay: o.created_at_display,
      tone: 'green',
      icon: 'bi-plus-circle-fill',
      tag: 'Created',
      description: `${who} created ${what}${o.label ? ` '${o.label}'` : ''}.`,
      changes: [],
      fields: [],
      actor: who,
      role: o.created_by?.role ?? null,
      branch: null,
      source: null,
    };
  }

  private fromActivity(a: LeadActivity): TimelineRow {
    const m = LEAD_ACTIONS[a.action] ?? { icon: 'bi-dot', tone: 'gray', label: a.action.replace(/_/g, ' ') };
    return {
      id: 'l' + a.id,
      at: a.created_at,
      atDisplay: formatDate(a.created_at, 'dd MMM yyyy, hh:mm:ss a', 'en-IN'),
      tone: m.tone,
      icon: m.icon,
      tag: m.label,
      description: a.description,
      changes: [],
      fields: [],
      actor: a.user || 'System',
      role: null,
      branch: null,
      source: null,
    };
  }
}
