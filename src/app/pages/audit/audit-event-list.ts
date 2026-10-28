import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnChanges, SimpleChanges, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Subject, catchError, combineLatest, debounceTime, distinctUntilChanged, finalize, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuditService } from '../../shared/common-services/audit.service';
import { saveBlob } from '../../shared/utils/export.util';
import { AuditEvent, AuditFilterOptions, AuditPagination, AuditQuery } from '../../shared/models/audit.model';
import { AuditEventDrawer } from './audit-event-drawer';
import { OUTCOME_LABEL, OUTCOME_TONE, RANGES, RangeKey, SEVERITY_LABEL, SEVERITY_TONE, actorInitials, auditError, clock, dayHeading, eventMeta, moduleText, paramsFromQuery, queryFromParams, rangeDates, recordText, sourceLabel } from './audit-meta';

export interface AuditListFeatures {
  user: boolean;
  module: boolean;
  event: boolean;
  outcome: boolean;
  severity: boolean;
  source: boolean;
}

const ALL_FEATURES: AuditListFeatures = { user: true, module: true, event: true, outcome: true, severity: true, source: true };

/**
 * Filter bar + server-paginated event table + details drawer, used by All Activity Logs, Data Change History,
 * Security Events and User Activity. Filters, page, sort and the opened event live in the URL query string, so a
 * refresh, a shared link and "back from an event" all restore the same view. Late responses of an older query are dropped
 * (switchMap), and nothing but the current page is ever fetched.
 */
@Component({
  selector: 'app-audit-event-list',
  standalone: true,
  imports: [CommonModule, AuditEventDrawer],
  templateUrl: './audit-event-list.html',
  styleUrls: ['./audit.scss'],
})
export class AuditEventList implements OnChanges {
  private readonly audit = inject(AuditService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly kind = input<'events' | 'changes' | 'security'>('events');
  /** Filters the user cannot change (e.g. the selected person, or a security preset). */
  readonly fixed = input<AuditQuery>({});
  readonly features = input<AuditListFeatures>(ALL_FEATURES);
  readonly emptyText = input('No audit events match these filters.');

  protected readonly rows = signal<AuditEvent[]>([]);
  protected readonly pagination = signal<AuditPagination | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<{ kind: string; message: string } | null>(null);
  protected readonly options = signal<AuditFilterOptions | null>(null);
  protected readonly query = signal<AuditQuery>({});
  protected readonly openId = signal<string | null>(null);
  protected readonly exporting = signal(false);
  protected readonly exportMessage = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly searchText = signal('');
  /** Timeline (default, easiest to read) or Table (dense); kept in the URL as ?view=table. */
  protected readonly view = signal<'timeline' | 'table'>('timeline');
  protected readonly groups = computed(() => {
    const out: { key: string; label: string; rows: AuditEvent[] }[] = [];
    for (const e of this.rows()) {
      const h = dayHeading(e.occurred_at);
      const last = out[out.length - 1];
      if (last?.key === h.key) last.rows.push(e);
      else out.push({ ...h, rows: [e] });
    }
    return out;
  });
  protected readonly clock = clock;

  protected readonly canExport = computed(() => this.auth.hasActionAccess('export-audit-logs'));
  protected readonly canSeeChanges = computed(() => this.auth.hasActionAccess('view-audit-changes'));
  protected readonly canSeeNetwork = computed(() => this.auth.hasActionAccess('view-audit-sensitive'));
  protected readonly subModules = computed(() => this.options()?.modules.find(m => m.slug === this.query().module)?.sub_modules ?? []);
  protected readonly ranges = RANGES;
  protected readonly pageSizes = [10, 25, 50, 100];
  protected readonly hasFilters = computed(() => {
    const q = this.query();
    return !!(q.search || q.from || q.to || q.module || q.sub_module || q.event?.length || q.outcome?.length || q.severity?.length || q.source || q.request_id || q.auditable_id || (q.actor_id && !this.fixed().actor_id));
  });

  protected readonly meta = eventMeta;
  protected readonly outcomeLabel = OUTCOME_LABEL;
  protected readonly outcomeTone = OUTCOME_TONE;
  protected readonly severityLabel = SEVERITY_LABEL;
  protected readonly severityTone = SEVERITY_TONE;
  protected readonly initials = actorInitials;
  protected readonly recordText = recordText;
  protected readonly moduleText = moduleText;
  protected readonly sourceLabel = sourceLabel;

  private readonly fixed$ = new BehaviorSubject<AuditQuery>({});
  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly search$ = new Subject<string>();

  constructor() {
    this.audit.filters().pipe(catchError(() => of(null))).subscribe(o => this.options.set(o));

    this.search$.pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(q => this.apply({ search: q || undefined, page: 1 }));

    combineLatest([this.route.queryParamMap, this.fixed$, this.refresh$]).pipe(
      map(([params, fixed]) => ({ query: { ...queryFromParams(params), ...fixed }, ev: params.get('ev') })),
      tap(({ query, ev }) => {
        this.query.set(query);
        this.openId.set(ev);
        this.view.set(this.route.snapshot.queryParamMap.get('view') === 'table' ? 'table' : 'timeline');
        this.searchText.set(query.search ?? '');
        this.loading.set(true);
        this.error.set(null);
      }),
      switchMap(({ query }) => this.audit.list(this.kind(), query).pipe(
        catchError(err => { this.error.set(auditError(err)); return of(null); }),
        finalize(() => this.loading.set(false)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(page => {
      this.rows.set(page?.data ?? []);
      this.pagination.set(page?.pagination ?? null);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fixed']) this.fixed$.next(this.fixed());
  }

  // ---- filters: every change goes through the URL
  protected apply(patch: Partial<AuditQuery>): void {
    const next: AuditQuery = { ...this.query(), ...patch };
    for (const key of Object.keys(this.fixed()) as (keyof AuditQuery)[]) delete next[key];
    this.router.navigate([], { relativeTo: this.route, queryParams: paramsFromQuery(next), queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onSearch(value: string): void {
    this.searchText.set(value);
    this.search$.next(value.trim());
  }

  protected setRange(key: RangeKey): void {
    this.apply({ ...rangeDates(key), page: 1 });
  }

  protected onDate(field: 'from' | 'to', value: string): void {
    this.apply({ [field]: value || undefined, page: 1 } as Partial<AuditQuery>);
  }

  protected selectedMulti(field: 'event' | 'outcome' | 'severity', value: string): boolean {
    return !!this.query()[field]?.includes(value);
  }

  protected toggleMulti(field: 'event' | 'outcome' | 'severity', value: string): void {
    const current = this.query()[field] ?? [];
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    this.apply({ [field]: next.length ? next : undefined, page: 1 } as Partial<AuditQuery>);
  }

  protected onUser(value: string): void {
    const [type, id] = value.split(':');
    this.apply(value ? { actor_type: type, actor_id: Number(id), page: 1 } : { actor_type: undefined, actor_id: undefined, page: 1 });
  }

  protected onModule(value: string): void {
    this.apply({ module: value || undefined, sub_module: undefined, page: 1 });
  }

  protected reset(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: null, from: null, to: null, module: null, sub: null, types: null, outcome: null, severity: null, source: null, actor: null, request: null, rt: null, rid: null, page: null, sort: null, dir: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setView(view: 'timeline' | 'table'): void {
    this.view.set(view);
    this.router.navigate([], { relativeTo: this.route, queryParams: { view: view === 'table' ? 'table' : null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected refresh(): void {
    this.refresh$.next();
  }

  // ---- sort / paging
  protected sort(column: string): void {
    const q = this.query();
    if (q.sort_by !== column) return this.apply({ sort_by: column, sort_direction: 'asc', page: 1 });
    if (q.sort_direction === 'asc') return this.apply({ sort_direction: 'desc', page: 1 });
    this.apply({ sort_by: undefined, sort_direction: undefined, page: 1 });
  }

  protected ariaSort(column: string): 'ascending' | 'descending' | 'none' {
    const q = this.query();
    return q.sort_by === column ? (q.sort_direction === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected sortIcon(column: string): string {
    const q = this.query();
    return q.sort_by !== column ? 'bi-chevron-expand' : q.sort_direction === 'asc' ? 'bi-chevron-up' : 'bi-chevron-down';
  }

  protected go(page: number): void {
    this.apply({ page });
  }

  protected rangeText(): string {
    const p = this.pagination();
    if (!p || !p.total) return '0 results';
    const from = (p.current_page - 1) * p.per_page + 1;
    return `${from}-${Math.min(p.total, from + p.per_page - 1)} of ${p.total.toLocaleString()}`;
  }

  // ---- details drawer (URL: ?ev=<id>)
  protected open(e: AuditEvent): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { ev: e.id }, queryParamsHandling: 'merge' });
  }

  protected closeDrawer(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { ev: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected showRequest(requestId: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { ev: null, request: requestId, page: null }, queryParamsHandling: 'merge' });
  }

  // ---- export (the server builds it from the same filters; "success" is shown only once the file arrived)
  protected doExport(format: 'xlsx' | 'csv'): void {
    this.exporting.set(true);
    this.exportMessage.set(null);
    const { page: _page, per_page: _size, ...filters } = this.query();
    this.audit.export(filters, format).pipe(finalize(() => this.exporting.set(false))).subscribe({
      next: (blob: Blob) => {
        saveBlob(blob, `audit-logs-${new Date().toISOString().slice(0, 10)}.${format}`);
        this.exportMessage.set({ ok: true, text: 'Export downloaded.' });
      },
      error: async (err: any) => {
        let text = auditError(err).message;
        try {
          const parsed = JSON.parse(await (err?.error as Blob).text());
          text = parsed?.message || text;
        } catch { /* keep the generic message */ }
        this.exportMessage.set({ ok: false, text });
      },
    });
  }
}
