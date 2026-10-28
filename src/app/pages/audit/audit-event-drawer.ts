import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, ViewChild, effect, inject, input, output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuditService } from '../../shared/common-services/audit.service';
import { Router } from '@angular/router';
import { AuditCall, AuditEvent } from '../../shared/models/audit.model';
import { AuditCallCards } from './audit-calls';
import { OUTCOME_LABEL, OUTCOME_TONE, SEVERITY_LABEL, SEVERITY_TONE, actorInitials, auditError, eventMeta, moduleText, recordText, sourceLabel } from './audit-meta';

/** Event details: who / when / where / what, request ids and the field-level before -> after table. */
@Component({
  selector: 'app-audit-event-drawer',
  standalone: true,
  imports: [CommonModule, AuditCallCards],
  templateUrl: './audit-event-drawer.html',
  styleUrls: ['./audit.scss'],
})
export class AuditEventDrawer {
  private readonly audit = inject(AuditService);
  private readonly auth = inject(AuthService);

  readonly eventId = input.required<string>();
  readonly closed = output<void>();
  readonly showRequest = output<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal<{ kind: string; message: string } | null>(null);
  protected readonly event = signal<AuditEvent | null>(null);
  protected readonly copied = signal(false);
  protected readonly tab = signal<'details' | 'history' | 'calls'>('details');
  protected readonly history = signal<AuditEvent[] | null>(null);
  protected readonly historyTotal = signal(0);
  protected readonly historyError = signal<string | null>(null);
  protected readonly calls = signal<AuditCall[] | null>(null);
  protected readonly callsTotal = signal(0);
  protected readonly callsError = signal<string | null>(null);
  protected readonly canHistory = this.auth.hasActionAccess('view-audit-data-changes');
  protected readonly canCalls = this.auth.hasActionAccess('view-audit-calls');
  private readonly router = inject(Router);

  @ViewChild('closeBtn') private closeBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('panel', { static: true }) private panel!: ElementRef<HTMLElement>;

  protected readonly meta = eventMeta;
  protected readonly outcomeLabel = OUTCOME_LABEL;
  protected readonly outcomeTone = OUTCOME_TONE;
  protected readonly severityLabel = SEVERITY_LABEL;
  protected readonly severityTone = SEVERITY_TONE;
  protected readonly initials = actorInitials;
  protected readonly recordText = recordText;
  protected readonly moduleText = moduleText;
  protected readonly sourceLabel = sourceLabel;
  protected readonly canSeeChanges = () => this.auth.hasActionAccess('view-audit-changes');

  private requested: string | null = null;
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  constructor() {
    effect(() => {
      const id = this.eventId();
      if (id !== this.requested) this.load(id);
    });
  }

  private load(id: string): void {
    this.requested = id;
    this.loading.set(true);
    this.error.set(null);
    this.event.set(null);
    this.tab.set('details');
    this.history.set(null);
    this.calls.set(null);
    this.audit.event(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: e => {
        if (id === this.requested) {
          this.event.set(e);
          setTimeout(() => this.closeBtn?.nativeElement.focus());
        }
      },
      error: err => this.error.set(auditError(err)),
    });
  }

  /** Record history and call history load only when their tab is opened. */
  selectTab(tab: 'details' | 'history' | 'calls'): void {
    this.tab.set(tab);
    const e = this.event();
    if (!e) return;
    if (tab === 'history' && this.history() === null && e.record.type && e.record.id) {
      this.historyError.set(null);
      this.audit.history(e.record.type, e.record.id, { per_page: 50 }).subscribe({
        next: p => { this.history.set(p.data); this.historyTotal.set(p.pagination?.total ?? p.data.length); },
        error: err => { this.history.set([]); this.historyError.set(auditError(err).message); },
      });
    }
    if (tab === 'calls' && this.calls() === null && e.related?.lead_id) {
      this.callsError.set(null);
      this.audit.calls({ lead_id: e.related.lead_id, per_page: 50 }).subscribe({
        next: p => { this.calls.set(p.data); this.callsTotal.set(p.pagination?.total ?? p.data.length); },
        error: err => { this.calls.set([]); this.callsError.set(auditError(err).message); },
      });
    }
  }

  openCall(c: AuditCall): void {
    this.router.navigate(['/app/audit/calls'], { queryParams: { call: c.id, lead: c.lead?.id ?? null } });
  }

  openHistoryEvent(e: AuditEvent): void {
    if (e.id !== this.event()?.id) this.load(e.id);
  }

  close(): void {
    this.closed.emit();
    setTimeout(() => this.previouslyFocused?.focus?.());
  }

  copyId(): void {
    const id = this.event()?.id;
    if (!id || !navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  isLong(value: string | null): boolean {
    return !!value && (value.length > 80 || value.includes('\n'));
  }

  extraEntries(e: AuditEvent): { key: string; value: string }[] {
    return Object.entries(e.extra ?? {}).map(([key, value]) => ({ key, value: typeof value === 'object' ? JSON.stringify(value) : String(value) }));
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      this.close();
      return;
    }
    if (ev.key !== 'Tab') return;
    // Keep focus inside the dialog.
    const nodes = Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])')).filter(n => !n.hasAttribute('disabled'));
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
}
