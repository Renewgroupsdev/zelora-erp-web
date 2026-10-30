import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, afterNextRender, computed, forwardRef, inject, input, output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { AuditService } from '../../common-services/audit.service';
import { AuditEvent, AuditFieldHistory, AuditPagination, AuditRecordLife } from '../../models/audit.model';
import { AuditEventDrawer } from '../../../pages/audit/audit-event-drawer';
import { OUTCOME_LABEL, OUTCOME_TONE, actorInitials, auditError, clock, dayHeading, eventMeta, sourceLabel } from '../../../pages/audit/audit-meta';

type Tab = 'path' | 'journey' | 'changes' | 'fields' | 'people';

/**
 * Full tracking of one record: where it was stored (who, when, from where, with which values), how it travelled
 * (hand-offs, deletion, restoration), every change with its before / after, how each field evolved and who touched it.
 * Read-only; the API enforces permission, branch scope and value redaction (view-audit-changes), and this drawer only
 * draws what comes back.
 */
@Component({
  selector: 'app-record-history-drawer',
  standalone: true,
  // RecordHistory (the button) is declared below and opens this drawer: a related record's History opens another drawer on top.
  imports: [CommonModule, AuditEventDrawer, forwardRef(() => RecordHistory)],
  templateUrl: './record-history.html',
  styleUrls: ['../../../pages/audit/audit.scss', './record-history.scss'],
})
export class RecordHistoryDrawer implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly audit = inject(AuditService);

  readonly type = input.required<string>();
  readonly recordId = input.required<string | number>();
  readonly title = input<string>('');
  readonly closed = output<void>();

  protected readonly life = signal<AuditRecordLife | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<{ kind: string; message: string } | null>(null);
  protected readonly tab = signal<Tab>('path');
  protected readonly openId = signal<string | null>(null);
  protected readonly openField = signal<string | null>(null);

  // "All changes" tab: every event of the record (and of its child rows) with the full before / after, loaded on first open.
  protected readonly events = signal<AuditEvent[] | null>(null);
  protected readonly pagination = signal<AuditPagination | null>(null);
  protected readonly eventsError = signal<string | null>(null);
  protected readonly loadingMore = signal(false);

  protected readonly meta = eventMeta;
  protected readonly initials = actorInitials;
  protected readonly clock = clock;
  protected readonly sourceLabel = sourceLabel;
  protected readonly outcomeLabel = OUTCOME_LABEL;
  protected readonly outcomeTone = OUTCOME_TONE;
  protected readonly tabs = computed<{ key: Tab; label: string; icon: string; count?: number }[]>(() => {
    const l = this.life();

    return [
      { key: 'path', label: 'Start to end', icon: 'bi-diagram-3', count: l?.path.length },
      { key: 'journey', label: 'This record', icon: 'bi-signpost-split', count: l?.journey.length },
      { key: 'changes', label: 'All changes', icon: 'bi-list-columns-reverse', count: l?.summary.events },
      { key: 'fields', label: 'By field', icon: 'bi-input-cursor-text', count: l?.fields.length },
      { key: 'people', label: 'People', icon: 'bi-people', count: l?.people.length },
    ];
  });
  protected readonly groups = computed(() => {
    const out: { key: string; label: string; rows: AuditEvent[] }[] = [];
    for (const e of this.events() ?? []) {
      const h = dayHeading(e.occurred_at);
      const last = out[out.length - 1];
      if (last?.key === h.key) last.rows.push(e);
      else out.push({ ...h, rows: [e] });
    }
    return out;
  });
  protected readonly stateTone = computed(() => ({ active: 'green', deleted: 'red', permanently_deleted: 'red' } as Record<string, string>)[this.life()?.state ?? 'active']);
  protected readonly stateLabel = computed(() => ({ active: 'Active', deleted: 'Deleted', permanently_deleted: 'Permanently deleted' } as Record<string, string>)[this.life()?.state ?? 'active']);

  @ViewChild('panel', { static: true }) private panel!: ElementRef<HTMLElement>;
  @ViewChild('closeBtn', { static: true }) private closeBtn!: ElementRef<HTMLButtonElement>;

  constructor() {
    // A page header can have its own stacking context (blur / transform): move the drawer to <body> so position:fixed covers the page.
    afterNextRender(() => {
      document.body.appendChild(this.host.nativeElement);
      this.closeBtn.nativeElement.focus();
    });
  }

  /** Inputs are bound by now (a signal input cannot be read in the constructor). */
  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.host.nativeElement.remove();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.audit.record(this.type(), this.recordId()).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: l => this.life.set(l),
      error: err => this.error.set(auditError(err)),
    });
  }

  protected select(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'changes' && this.events() === null) this.loadEvents(1);
  }

  protected loadEvents(page: number): void {
    if (page === 1) this.eventsError.set(null);
    this.loadingMore.set(page > 1);
    this.audit.history(this.type(), this.recordId(), { page, per_page: 20, detail: 1 }).pipe(finalize(() => this.loadingMore.set(false))).subscribe({
      next: p => { this.events.update(r => (page === 1 ? p.data : [...(r ?? []), ...p.data])); this.pagination.set(p.pagination ?? null); },
      error: err => { this.events.update(r => r ?? []); this.eventsError.set(auditError(err).message); },
    });
  }

  protected more(): void {
    const p = this.pagination();
    if (p && p.current_page < p.last_page) this.loadEvents(p.current_page + 1);
  }

  protected toggleField(f: AuditFieldHistory): void {
    this.openField.update(v => (v === f.field ? null : f.field));
  }

  /** Step tone for the journey line. */
  protected readonly hasLineage = computed(() => !!this.life() && (this.life()!.lineage.upstream.length + this.life()!.lineage.downstream.length) > 0);

  protected stepTone(kind: string): string {
    return ({ stored: 'green', moved: 'blue', deleted: 'red', restored: 'teal' } as Record<string, string>)[kind] ?? 'gray';
  }

  protected stepIcon(kind: string): string {
    return ({ stored: 'bi-box-arrow-in-down', moved: 'bi-signpost-split', deleted: 'bi-trash3', restored: 'bi-arrow-counterclockwise' } as Record<string, string>)[kind] ?? 'bi-circle';
  }

  protected close(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    // While an event is open, its own drawer handles Escape / Tab.
    if (this.openId()) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); this.close(); return; }
    if (ev.key !== 'Tab') return;
    const nodes = Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), [href]'));
    if (!nodes.length) return;
    if (ev.shiftKey && document.activeElement === nodes[0]) { ev.preventDefault(); nodes[nodes.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === nodes[nodes.length - 1]) { ev.preventDefault(); nodes[0].focus(); }
  }
}

/**
 * "History" button for one record (lead, customer, branch...). Hidden for roles without "view-audit-data-changes"
 * and until the record has an id. `type` is the audited model name as the backend stores it (class basename,
 * e.g. "Branch", "CustomerLead").
 */
@Component({
  selector: 'app-record-history',
  standalone: true,
  imports: [CommonModule, RecordHistoryDrawer],
  styleUrls: ['./record-history.scss'],
  template: `
    @if (allowed() && recordId() != null && recordId() !== '') {
      <button type="button" class="rh-btn" [class.icon]="variant() === 'icon'" (click)="open.set(true)" [attr.aria-label]="'View full history of ' + (title() || 'this record')" title="View full history">
        <i class="bi bi-clock-history" aria-hidden="true"></i>@if (variant() === 'button') { <span>History</span> }
      </button>
      @if (open()) { <app-record-history-drawer [type]="type()" [recordId]="recordId()!" [title]="title()" (closed)="open.set(false)" /> }
    }
  `,
})
export class RecordHistory {
  readonly type = input.required<string>();
  readonly recordId = input.required<string | number | null | undefined>();
  readonly title = input<string>('');
  /** "button" (icon + text) or "icon" (icon only, for table rows). */
  readonly variant = input<'button' | 'icon'>('button');

  private readonly auth = inject(AuthService);
  protected readonly allowed = computed(() => this.auth.hasActionAccess('view-audit-data-changes'));
  protected readonly open = signal(false);
}
