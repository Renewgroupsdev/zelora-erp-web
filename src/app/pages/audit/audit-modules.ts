import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, distinctUntilChanged, finalize, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RecordHistory } from '../../shared/components/record-history/record-history';
import { AuditService } from '../../shared/common-services/audit.service';
import { AuditModuleOverview, AuditModuleRow, ModuleActivityStats } from '../../shared/models/audit.model';
import { AuditChart } from './audit-chart';
import { AuditEventList, AuditListFeatures } from './audit-event-list';
import { AuditDenied } from './audit-pages';
import { RANGES, RangeKey, actorInitials, auditError, rangeDates } from './audit-meta';

const PALETTE = ['#4aab90', '#5b8def', '#e0735f', '#8c6fd8', '#f0a23b', '#2aa7ad', '#9aa7a4', '#c46aa0', '#6fa83f', '#d9c13a'];

/** "3 hours ago" from an ISO timestamp, or "No activity" when there is none. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'No activity';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, secs] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(diff) >= secs) return fmt.format(Math.round(diff / secs), unit);
  }

  return 'just now';
}

type SortKey = 'active' | 'recent' | 'name';

// ---------------------------------------------------------------------------------------------- Module Activity (grid)
/**
 * One card per sidebar module the role can open, with that module's activity in the chosen period. Figures come from one
 * grouped query on the server (zero-activity modules included); search and sort only rearrange the few cards already loaded.
 */
@Component({
  selector: 'app-audit-modules',
  standalone: true,
  imports: [CommonModule, RouterLink, AuditDenied],
  styleUrls: ['./audit.scss', './audit-modules.scss'],
  templateUrl: './audit-modules.html',
})
export class AuditModules {
  private readonly audit = inject(AuditService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly allowed = inject(AuthService).hasActionAccess('view-module-activity');
  protected readonly rows = signal<AuditModuleRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<{ kind: string; message: string } | null>(null);
  protected readonly range = signal<{ from: string; to: string }>(rangeDates('30d'));
  protected readonly search = signal('');
  protected readonly sort = signal<SortKey>('active');
  protected readonly ranges = RANGES;
  protected readonly sorts: { key: SortKey; label: string }[] = [{ key: 'active', label: 'Most active' }, { key: 'recent', label: 'Most recent' }, { key: 'name', label: 'Name' }];
  protected readonly relativeTime = relativeTime;

  protected readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows().filter(m => !q || m.name.toLowerCase().includes(q) || (m.sub_modules ?? []).some(s => s.name.toLowerCase().includes(q)));
    const by: Record<SortKey, (a: AuditModuleRow, b: AuditModuleRow) => number> = {
      active: (a, b) => b.total - a.total || a.name.localeCompare(b.name),
      recent: (a, b) => (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '') || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
    };

    return [...list].sort(by[this.sort()]);
  });
  protected readonly totals = computed(() => ({ events: this.rows().reduce((n, m) => n + m.total, 0), active: this.rows().filter(m => m.total > 0).length, modules: this.rows().length }));

  constructor() {
    if (!this.allowed) return;

    this.route.queryParamMap.pipe(
      map(p => ({ from: p.get('from') || rangeDates('30d').from, to: p.get('to') || rangeDates('30d').to, r: p.get('r') })),
      distinctUntilChanged((a, b) => a.from === b.from && a.to === b.to && a.r === b.r),
      tap(r => { this.range.set({ from: r.from, to: r.to }); this.loading.set(true); this.error.set(null); }),
      switchMap(r => this.audit.modules({ from: r.from, to: r.to }).pipe(
        catchError(err => { this.error.set(auditError(err)); return of(null); }),
        finalize(() => this.loading.set(false)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(res => this.rows.set(res?.data ?? []));
  }

  protected setRange(key: RangeKey): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: rangeDates(key), replaceUrl: true });
  }

  protected setDate(field: 'from' | 'to', value: string): void {
    if (value) this.router.navigate([], { relativeTo: this.route, queryParams: { [field]: value }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected reload(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { r: Date.now() }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Width (%) of the created / updated / deleted segments of a card's mini bar. */
  protected share(m: AuditModuleRow, part: 'created' | 'updated' | 'deleted'): number {
    const sum = m.created + m.updated + m.deleted;

    return sum ? Math.round((m[part] / sum) * 100) : 0;
  }
}

// ---------------------------------------------------------------------------------------------- Module Activity (one module)
type ModuleTab = 'overview' | 'activity' | 'people' | 'records';

/** One module: figures, charts, people, most-changed records and the module's own event list (server-paginated). */
@Component({
  selector: 'app-audit-module-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, AuditChart, AuditEventList, AuditDenied, RecordHistory],
  styleUrls: ['./audit.scss', './audit-modules.scss'],
  templateUrl: './audit-module-detail.html',
})
export class AuditModuleDetail {
  private readonly audit = inject(AuditService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  protected readonly allowed = this.auth.hasActionAccess('view-module-activity');
  protected readonly canUsers = this.auth.hasActionAccess('view-audit-user-activity');
  protected readonly slug = toSignal(this.route.paramMap.pipe(map(p => p.get('slug') ?? '')), { initialValue: '' });
  protected readonly tab = toSignal(this.route.queryParamMap.pipe(map(p => (['activity', 'people', 'records'].includes(p.get('tab') ?? '') ? p.get('tab')! : 'overview') as ModuleTab)), { initialValue: 'overview' as ModuleTab });
  protected readonly module = signal<{ slug: string; name: string; icon?: string | null; parent_slug?: string | null; parent_name?: string | null } | null>(null);
  protected readonly stats = signal<ModuleActivityStats | null>(null);
  protected readonly overview = signal<AuditModuleOverview | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<{ kind: string; message: string } | null>(null);
  protected readonly range = signal<{ from: string; to: string }>(rangeDates('30d'));
  protected readonly ranges = RANGES;
  protected readonly initials = actorInitials;
  protected readonly relativeTime = relativeTime;
  protected readonly tabs: { key: ModuleTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'bi-speedometer2' },
    { key: 'activity', label: 'Activity', icon: 'bi-list-columns-reverse' },
    { key: 'people', label: 'People', icon: 'bi-people' },
    { key: 'records', label: 'Records', icon: 'bi-journal-text' },
  ];
  protected readonly features: AuditListFeatures = { user: true, module: false, event: true, outcome: true, severity: false, source: false };

  protected readonly dayLabels = computed(() => (this.overview()?.by_day ?? []).map(d => d.day.slice(5).replace('-', '/')));
  protected readonly dayDatasets = computed(() => {
    const d = this.overview()?.by_day ?? [];
    return [
      { label: 'Successful', data: d.map(x => x.success), backgroundColor: '#4aab90', borderColor: '#4aab90', borderRadius: 3 },
      { label: 'Failed / denied', data: d.map(x => x.failed), backgroundColor: '#e0735f', borderColor: '#e0735f', borderRadius: 3 },
    ];
  });
  protected readonly subLabels = computed(() => (this.overview()?.by_sub_module ?? []).map(s => s.name));
  protected readonly subDatasets = computed(() => [{ label: 'Events', data: (this.overview()?.by_sub_module ?? []).map(s => s.total), backgroundColor: '#5b8def', borderRadius: 3 }]);
  protected readonly typeLabels = computed(() => (this.overview()?.by_record_type ?? []).map(t => t.name));
  protected readonly typeDatasets = computed(() => [{ label: 'Events', data: (this.overview()?.by_record_type ?? []).map(t => t.total), backgroundColor: PALETTE }]);

  constructor() {
    if (!this.allowed) return;

    // Slug and period come from the URL; every change reloads the figures (an older, slower answer is dropped by switchMap).
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      map(([params, q]) => ({ slug: params.get('slug') ?? '', from: q.get('from') || rangeDates('30d').from, to: q.get('to') || rangeDates('30d').to, r: q.get('r') })),
      distinctUntilChanged((a, b) => a.slug === b.slug && a.from === b.from && a.to === b.to && a.r === b.r),
      tap(k => { this.range.set({ from: k.from, to: k.to }); this.loading.set(true); this.error.set(null); }),
      switchMap(k => this.audit.moduleActivity(k.slug, { from: k.from, to: k.to, per_page: 1 }, true).pipe(
        catchError(err => { this.error.set(auditError(err)); return of(null); }),
        finalize(() => this.loading.set(false)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(res => {
      this.module.set(res?.module ?? null);
      this.stats.set(res?.stats ?? null);
      this.overview.set(res?.overview ?? null);
    });
  }

  protected setTab(key: ModuleTab): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: key === 'overview' ? null : key }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected setRange(key: RangeKey): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { ...rangeDates(key), page: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected setDate(field: 'from' | 'to', value: string): void {
    if (value) this.router.navigate([], { relativeTo: this.route, queryParams: { [field]: value, page: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected reload(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { r: Date.now() }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
