import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, ViewChild, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, finalize, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuditService } from '../../shared/common-services/audit.service';
import { AuditCall, AuditCallDetail, AuditCallQuery, AuditCallStats, AuditPagination } from '../../shared/models/audit.model';
import { CALL_STATUS_TONE, RANGES, RangeKey, actorInitials, auditError, dayHeading, duration, rangeDates } from './audit-meta';

/** Call cards, read like the Call Log History dialog: telecaller + Emp No, when, outcome, notes, recording. */
@Component({
  selector: 'app-audit-call-cards',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./audit.scss'],
  template: `
    <div class="au-calls">
      @for (g of groups(); track g.key) {
        @if (grouped()) { <div class="au-tl-day">{{ g.label }} <span class="cnt">{{ g.calls.length }} call{{ g.calls.length === 1 ? '' : 's' }}</span></div> }
        @for (c of g.calls; track c.id) {
          <div class="au-call" role="button" tabindex="0" [class.missed]="isMissed(c)" [class.inbound]="c.direction === 'inbound'" (click)="opened.emit(c)" (keydown.enter)="opened.emit(c)" [attr.aria-label]="'Open call ' + c.call_id">
            <span class="dot" [ngClass]="tone(c)" aria-hidden="true"><i class="bi" [ngClass]="c.direction === 'inbound' ? 'bi-telephone-inbound-fill' : 'bi-telephone-outbound-fill'"></i></span>
            <div style="min-width: 0">
              <div class="who">
                <span class="nm">{{ c.telecaller?.name || 'Unassigned' }}</span>
                @if (c.telecaller?.emp_code) { <span class="emp">Emp No: {{ c.telecaller?.emp_code }}</span> }
                <i class="bi bi-arrow-right" aria-hidden="true" style="color: var(--au-muted)"></i>
                <span class="nm">{{ c.lead?.name || 'Unknown caller' }}</span>
                <span class="emp">{{ c.number || c.lead?.mobile || '-' }}</span>
              </div>
              <div class="when">
                <span><i class="bi bi-calendar-event" aria-hidden="true"></i> {{ c.started_at?.display || '-' }}</span>
                <span><i class="bi bi-stopwatch" aria-hidden="true"></i> Talk {{ dur(c.talk_seconds) }}</span>
                @if (c.branch) { <span><i class="bi bi-geo-alt" aria-hidden="true"></i> {{ c.branch }}</span> }
                <span><i class="bi bi-hash" aria-hidden="true"></i>{{ c.call_id }}</span>
              </div>
              @if (c.notes) { <p class="note">{{ c.notes }}</p> }
            </div>
            <div class="side">
              <span class="au-badge" [ngClass]="tone(c)">{{ c.status_label }}</span>
              @if (c.outcome) { <span class="au-badge gray">{{ c.outcome }}</span> }
              <span>{{ c.direction === 'inbound' ? 'Incoming' : 'Outgoing' }}</span>
              @if (c.recording_url) { <audio controls preload="none" [src]="c.recording_url" (click)="$event.stopPropagation()" aria-label="Call recording"></audio> }
            </div>
          </div>
        }
      }
    </div>`,
})
export class AuditCallCards {
  readonly calls = input.required<AuditCall[]>();
  readonly grouped = input(true);
  readonly opened = output<AuditCall>();

  protected readonly dur = duration;
  protected readonly groups = computed(() => {
    const out: { key: string; label: string; calls: AuditCall[] }[] = [];
    for (const c of this.calls()) {
      const h = c.started_at ? dayHeading(c.started_at.iso) : { key: 'unknown', label: 'Unknown date' };
      const last = out[out.length - 1];
      if (last?.key === h.key) last.calls.push(c);
      else out.push({ ...h, calls: [c] });
    }
    return out;
  });

  protected isMissed(c: AuditCall): boolean {
    return ['missed', 'no_answer', 'rejected', 'busy', 'failed'].includes(c.status);
  }

  protected tone(c: AuditCall): string {
    return CALL_STATUS_TONE[c.status] ?? 'gray';
  }
}

/** One call in full: summary, line timeline (ringing / answered / hold / ended), who it rang, notes and recordings. */
@Component({
  selector: 'app-audit-call-drawer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrls: ['./audit.scss'],
  templateUrl: './audit-call-drawer.html',
})
export class AuditCallDrawer {
  private readonly audit = inject(AuditService);
  protected readonly canChanges = inject(AuthService).hasActionAccess('view-audit-data-changes');

  readonly callId = input.required<number>();
  readonly closed = output<void>();

  protected readonly call = signal<AuditCallDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly dur = duration;
  protected readonly initials = actorInitials;
  protected readonly tone = (s: string) => CALL_STATUS_TONE[s] ?? 'gray';

  @ViewChild('panel', { static: true }) private panel!: ElementRef<HTMLElement>;
  @ViewChild('closeBtn', { static: true }) private closeBtn!: ElementRef<HTMLButtonElement>;
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;

  constructor() {
    effect(() => {
      const id = this.callId();
      this.loading.set(true);
      this.error.set(null);
      this.audit.call(id).pipe(finalize(() => this.loading.set(false))).subscribe({
        next: c => { this.call.set(c); setTimeout(() => this.closeBtn.nativeElement.focus()); },
        error: err => this.error.set(auditError(err).message),
      });
    });
  }

  close(): void {
    this.closed.emit();
    setTimeout(() => this.previouslyFocused?.focus?.());
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') { ev.stopPropagation(); this.close(); return; }
    if (ev.key !== 'Tab') return;
    const nodes = Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>('button, [href], audio, [tabindex]:not([tabindex="-1"])'));
    if (!nodes.length) return;
    if (ev.shiftKey && document.activeElement === nodes[0]) { ev.preventDefault(); nodes[nodes.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === nodes[nodes.length - 1]) { ev.preventDefault(); nodes[0].focus(); }
  }
}

/** Audit Trail -> Call History: every call with its telecaller, lead, outcome, talk time, notes and recording. */
@Component({
  selector: 'app-audit-call-history',
  standalone: true,
  imports: [CommonModule, AuditCallCards, AuditCallDrawer],
  styleUrls: ['./audit.scss'],
  templateUrl: './audit-call-history.html',
})
export class AuditCallHistory {
  private readonly audit = inject(AuditService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly allowed = inject(AuthService).hasActionAccess('view-audit-calls');
  protected readonly calls = signal<AuditCall[]>([]);
  protected readonly stats = signal<AuditCallStats | null>(null);
  protected readonly pagination = signal<AuditPagination | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<{ kind: string; message: string } | null>(null);
  protected readonly query = signal<AuditCallQuery>({});
  protected readonly openId = signal<number | null>(null);
  protected readonly searchText = signal('');
  protected readonly ranges = RANGES;
  protected readonly dur = duration;

  private readonly search$ = new Subject<string>();

  constructor() {
    if (!this.allowed) return;
    this.search$.pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(q => this.apply({ q: q || null, page: null }));

    this.route.queryParamMap.pipe(
      map(p => ({
        query: {
          search: p.get('q') ?? undefined, from: p.get('from') ?? undefined, to: p.get('to') ?? undefined,
          direction: p.get('direction') ?? undefined, outcome: p.get('outcome') ?? undefined,
          lead_id: Number(p.get('lead')) || undefined, page: Number(p.get('page')) || 1, per_page: 20,
        } as AuditCallQuery,
        call: Number(p.get('call')) || null,
      })),
      tap(({ query, call }) => {
        this.query.set(query);
        this.openId.set(call);
        this.searchText.set(query.search ?? '');
      }),
      map(({ query }) => JSON.stringify(query)),
      distinctUntilChanged(),
      tap(() => { this.loading.set(true); this.error.set(null); }),
      switchMap(json => this.audit.calls(JSON.parse(json)).pipe(
        catchError(err => { this.error.set(auditError(err)); return of(null); }),
        finalize(() => this.loading.set(false)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(res => {
      this.calls.set(res?.data ?? []);
      this.pagination.set(res?.pagination ?? null);
      this.stats.set(res?.stats ?? null);
    });
  }

  protected apply(params: Record<string, string | number | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onSearch(value: string): void {
    this.searchText.set(value);
    this.search$.next(value.trim());
  }

  protected setRange(key: RangeKey): void {
    this.apply({ ...rangeDates(key), page: null });
  }

  protected reset(): void {
    this.apply({ q: null, from: null, to: null, direction: null, outcome: null, lead: null, page: null });
  }

  protected open(c: AuditCall): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { call: c.id }, queryParamsHandling: 'merge' });
  }

  protected closeDrawer(): void {
    this.apply({ call: null });
  }

  protected answerRate(): string {
    const s = this.stats();
    return s && s.total ? `${Math.round((s.answered / s.total) * 100)}%` : '-';
  }
}
