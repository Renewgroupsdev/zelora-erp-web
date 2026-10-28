import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, debounceTime, distinctUntilChanged, finalize, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuditService } from '../../shared/common-services/audit.service';
import { AuditEvent, AuditPagination, AuditQuery, AuditSummary, AuditUserProfile, AuditUserRow } from '../../shared/models/audit.model';
import { AuditChart } from './audit-chart';
import { AuditEventList } from './audit-event-list';
import { OUTCOME_LABEL, OUTCOME_TONE, RANGES, RangeKey, SEVERITY_LABEL, SEVERITY_TONE, actorInitials, auditError, eventMeta, moduleText, rangeDates, recordText } from './audit-meta';

/** Shown when the role lacks the page's action: no request is sent, so nothing leaks through totals or charts. */
@Component({
  selector: 'app-audit-denied',
  standalone: true,
  styleUrls: ['./audit.scss'],
  template: `<div class="au-panel"><div class="au-state denied" role="alert"><i class="bi bi-lock-fill" aria-hidden="true"></i><strong>Access denied</strong>Your role does not have permission to view this page. Ask an administrator to grant it in Roles &amp; Permissions.</div></div>`,
})
export class AuditDenied {}

// ---------------------------------------------------------------------------------------------- All Activity Logs
@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [AuditEventList, AuditDenied],
  styleUrls: ['./audit.scss'],
  template: `
    <div class="au-page">
      <div class="au-header">
        <div><h1><i class="bi bi-list-ul" aria-hidden="true"></i> All Activity Logs</h1><p>Every recorded action in the application. Select an event for the full details.</p></div>
      </div>
      @if (allowed) { <app-audit-event-list kind="events" /> } @else { <app-audit-denied /> }
    </div>`,
})
export class AuditLogs {
  protected readonly allowed = inject(AuthService).hasActionAccess('view-audit-events');
}

// ---------------------------------------------------------------------------------------------- Data Change History
@Component({
  selector: 'app-audit-changes',
  standalone: true,
  imports: [AuditEventList, AuditDenied],
  styleUrls: ['./audit.scss'],
  template: `
    <div class="au-page">
      <div class="au-header">
        <div><h1><i class="bi bi-clock-history" aria-hidden="true"></i> Data Change History</h1><p>Who created, edited, deleted or restored records, with the value before and after.</p></div>
      </div>
      @if (allowed) {
        <app-audit-event-list kind="changes" [features]="features" emptyText="No data changes match these filters." />
      } @else { <app-audit-denied /> }
    </div>`,
})
export class AuditChanges {
  protected readonly allowed = inject(AuthService).hasActionAccess('view-audit-data-changes');
  protected readonly features = { user: true, module: true, event: true, outcome: false, severity: false, source: false };
}

// ---------------------------------------------------------------------------------------------- Security Events
const SECURITY_VIEWS: { key: string; label: string; query: AuditQuery }[] = [
  { key: 'all', label: 'All security events', query: {} },
  { key: 'failed', label: 'Failed sign-ins', query: { event: ['login_failed'] } },
  { key: 'denied', label: 'Permission denied', query: { event: ['access_denied'] } },
  { key: 'perm', label: 'Permission & role changes', query: { event: ['permission_changed'] } },
  { key: 'high', label: 'Warning / high severity', query: { severity: ['warning', 'high'] } },
];

@Component({
  selector: 'app-audit-security',
  standalone: true,
  imports: [CommonModule, AuditEventList, AuditDenied],
  styleUrls: ['./audit.scss'],
  template: `
    <div class="au-page">
      <div class="au-header">
        <div><h1><i class="bi bi-shield-exclamation" aria-hidden="true"></i> Security Events</h1>
          <p>Failed sign-ins, denied requests, permission changes and other flagged events.</p></div>
      </div>
      @if (allowed) {
        <div class="au-note" role="note">These are events the application recorded. A flagged event is a reason to look, not proof of misuse; confirm with the person concerned before drawing conclusions.</div>
        <div class="au-chips" role="group" aria-label="Security view">
          @for (v of views; track v.key) { <button type="button" class="au-chip" [class.on]="view() === v.key" [attr.aria-pressed]="view() === v.key" (click)="select(v.key)">{{ v.label }}</button> }
        </div>
        <app-audit-event-list kind="security" [fixed]="fixed()" emptyText="No security events match this view." />
      } @else { <app-audit-denied /> }
    </div>`,
})
export class AuditSecurity {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly allowed = inject(AuthService).hasActionAccess('view-audit-security');
  protected readonly views = SECURITY_VIEWS;
  protected readonly view = toSignal(this.route.queryParamMap.pipe(map(p => (SECURITY_VIEWS.some(v => v.key === p.get('view')) ? p.get('view')! : 'all'))), { initialValue: 'all' });
  protected readonly fixed = computed<AuditQuery>(() => SECURITY_VIEWS.find(v => v.key === this.view())?.query ?? {});

  protected select(key: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { view: key === 'all' ? null : key, page: null, types: null, severity: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

// ---------------------------------------------------------------------------------------------- User Activity
@Component({
  selector: 'app-audit-user-activity',
  standalone: true,
  imports: [CommonModule, AuditEventList, AuditDenied],
  styleUrls: ['./audit.scss'],
  templateUrl: './audit-user-activity.html',
})
export class AuditUserActivity {
  private readonly audit = inject(AuditService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly allowed = inject(AuthService).hasActionAccess('view-audit-user-activity');
  protected readonly users = signal<AuditUserRow[]>([]);
  protected readonly pagination = signal<AuditPagination | null>(null);
  protected readonly loadingUsers = signal(true);
  protected readonly usersError = signal<string | null>(null);
  protected readonly profile = signal<AuditUserProfile | null>(null);
  protected readonly profileError = signal<string | null>(null);
  protected readonly searchText = signal('');
  protected readonly selected = signal<{ type: string; id: number } | null>(null);
  protected readonly initials = actorInitials;
  protected readonly fixed = computed<AuditQuery>(() => {
    const s = this.selected();
    return s ? { actor_type: s.type, actor_id: s.id } : {};
  });

  private readonly page$ = new BehaviorSubject(1);
  private readonly search$ = new BehaviorSubject('');

  constructor() {
    if (!this.allowed) return;

    this.route.queryParamMap.pipe(map(p => p.get('u')), distinctUntilChanged(), tap(u => {
      const [type, id] = (u ?? '').split(':');
      this.selected.set(type && Number(id) ? { type, id: Number(id) } : null);
      this.profile.set(null);
      this.profileError.set(null);
    }), switchMap(u => {
      const [type, id] = (u ?? '').split(':');
      return type && Number(id) ? this.audit.user(type, Number(id)).pipe(catchError(err => { this.profileError.set(auditError(err).message); return of(null); })) : of(null);
    }), takeUntilDestroyed(this.destroyRef)).subscribe(p => this.profile.set(p));

    combineLatest([this.page$, this.search$.pipe(debounceTime(350), distinctUntilChanged())]).pipe(
      tap(() => { this.loadingUsers.set(true); this.usersError.set(null); }),
      switchMap(([page, search]) => this.audit.users({ page, per_page: 20, search }).pipe(
        catchError(err => { this.usersError.set(auditError(err).message); return of(null); }),
        finalize(() => this.loadingUsers.set(false)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(res => {
      this.users.set(res?.data ?? []);
      this.pagination.set(res?.pagination ?? null);
    });
  }

  protected onSearch(value: string): void {
    this.searchText.set(value);
    this.page$.next(1);
    this.search$.next(value.trim());
  }

  protected go(page: number): void {
    this.page$.next(page);
  }

  protected pick(u: AuditUserRow): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { u: `${u.type}:${u.id}`, ev: null, page: null, q: null, from: null, to: null, module: null, sub: null, types: null, outcome: null, severity: null, source: null }, queryParamsHandling: 'merge' });
  }

  protected isSelected(u: AuditUserRow): boolean {
    const s = this.selected();
    return !!s && s.type === u.type && s.id === u.id;
  }

  protected typeLabel(type: string): string {
    return ({ user: 'Staff user', employee: 'Employee', customer: 'Customer' } as Record<string, string>)[type] ?? type;
  }
}

// ---------------------------------------------------------------------------------------------- Audit Dashboard
@Component({
  selector: 'app-audit-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, AuditChart, AuditDenied],
  styleUrls: ['./audit.scss'],
  templateUrl: './audit-dashboard.html',
})
export class AuditDashboard {
  private readonly audit = inject(AuditService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly allowed = this.auth.hasActionAccess('view-audit-dashboard');
  protected readonly canEvents = this.auth.hasActionAccess('view-audit-events');
  protected readonly canSecurity = this.auth.hasActionAccess('view-audit-security');
  protected readonly canUsers = this.auth.hasActionAccess('view-audit-user-activity');
  protected readonly summary = signal<AuditSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<{ kind: string; message: string } | null>(null);
  protected readonly range = signal<{ from: string; to: string }>(rangeDates('7d'));
  protected readonly ranges = RANGES;

  protected readonly meta = eventMeta;
  protected readonly outcomeLabel = OUTCOME_LABEL;
  protected readonly outcomeTone = OUTCOME_TONE;
  protected readonly severityLabel = SEVERITY_LABEL;
  protected readonly severityTone = SEVERITY_TONE;
  protected readonly initials = actorInitials;
  protected readonly recordText = recordText;
  protected readonly moduleText = moduleText;

  protected readonly dayLabels = computed(() => (this.summary()?.by_day ?? []).map(d => d.day.slice(5).replace('-', '/')));
  protected readonly activityDatasets = computed(() => {
    const d = this.summary()?.by_day ?? [];
    return [
      { label: 'Successful', data: d.map(x => x.success), backgroundColor: '#4aab90', borderColor: '#4aab90', borderRadius: 3 },
      { label: 'Failed / denied', data: d.map(x => x.failed), backgroundColor: '#e0735f', borderColor: '#e0735f', borderRadius: 3 },
    ];
  });
  protected readonly moduleLabels = computed(() => (this.summary()?.by_module ?? []).map(m => m.name));
  protected readonly moduleDatasets = computed(() => [{ label: 'Events', data: (this.summary()?.by_module ?? []).map(m => m.total), backgroundColor: '#5b8def', borderRadius: 3 }]);
  protected readonly eventLabels = computed(() => (this.summary()?.by_event ?? []).map(e => e.label));
  protected readonly eventDatasets = computed(() => [{ label: 'Events', data: (this.summary()?.by_event ?? []).map(e => e.total), backgroundColor: ['#4aab90', '#5b8def', '#e0735f', '#8c6fd8', '#f0a23b', '#2aa7ad', '#9aa7a4', '#c46aa0', '#6fa83f', '#d9c13a'] }]);
  protected readonly outcomeLabels = computed(() => (this.summary()?.by_outcome ?? []).map(o => OUTCOME_LABEL[o.outcome] ?? o.outcome));
  protected readonly outcomeDatasets = computed(() => [{ label: 'Events', data: (this.summary()?.by_outcome ?? []).map(o => o.total), backgroundColor: (this.summary()?.by_outcome ?? []).map(o => ({ success: '#4aab90', failed: '#e0735f', denied: '#f0a23b' } as Record<string, string>)[o.outcome] ?? '#9aa7a4') }]);

  constructor() {
    if (!this.allowed) return;

    this.route.queryParamMap.pipe(
      map(p => ({ from: p.get('from') || rangeDates('7d').from, to: p.get('to') || rangeDates('7d').to })),
      tap(r => { this.range.set(r); this.loading.set(true); this.error.set(null); }),
      switchMap(r => this.audit.summary(r).pipe(
        catchError(err => { this.error.set(auditError(err)); return of(null); }),
        finalize(() => this.loading.set(false)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(s => this.summary.set(s));
  }

  protected setRange(key: RangeKey): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: rangeDates(key), replaceUrl: true });
  }

  protected setDate(field: 'from' | 'to', value: string): void {
    if (value) this.router.navigate([], { relativeTo: this.route, queryParams: { [field]: value }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected reload(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { ...this.range(), r: Date.now() }, replaceUrl: true });
  }

  protected openEvent(e: AuditEvent): void {
    this.router.navigate(['/app/audit/logs'], { queryParams: { ev: e.id } });
  }
}
