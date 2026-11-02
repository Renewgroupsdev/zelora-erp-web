import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, finalize, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuditService } from '../../shared/common-services/audit.service';
import { AuditMeSummary } from '../../shared/models/audit.model';
import { AuditActivityCharts, AuditSignIns } from './audit-activity-parts';
import { AuditDenied } from './audit-pages';
import { AuditEventList, AuditListFeatures } from './audit-event-list';
import { RANGES, RangeKey, actorInitials, auditError, rangeDates } from './audit-meta';

/**
 * "My Activity": the signed-in person's own trail (staff account + linked HR employee). Open to every staff role through
 * `view-my-activity`; the API always answers for the caller, so nothing on this page can be pointed at someone else.
 * The period lives in the URL (from / to) and drives both the figures and the event list below.
 */
@Component({
  selector: 'app-audit-me',
  standalone: true,
  imports: [CommonModule, AuditActivityCharts, AuditSignIns, AuditEventList, AuditDenied],
  styleUrls: ['./audit.scss'],
  templateUrl: './audit-me.html',
})
export class AuditMyActivity {
  private readonly audit = inject(AuditService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly allowed = inject(AuthService).hasActionAccess('view-my-activity');
  protected readonly summary = signal<AuditMeSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<{ kind: string; message: string } | null>(null);
  protected readonly range = signal<{ from: string; to: string }>(rangeDates('30d'));
  protected readonly ranges = RANGES;
  protected readonly initials = actorInitials;
  /** No person / actor filter: the list is always the caller's own. */
  protected readonly features: AuditListFeatures = { user: false, module: true, event: true, outcome: true, severity: false, source: false };
  protected readonly identityText = computed(() => {
    const ids = this.summary()?.person.identities ?? [];
    const kinds = ids.map(i => (i.type === 'employee' ? 'HR employee' : 'Staff account'));

    return ids.length > 1 ? `${kinds.join(' + ')} are shown together` : '';
  });
  protected readonly me = computed(() => this.summary()?.person.identities[0] ?? null);
  /** The API sends the raw timestamp ("2026-10-28 10:00:00+00"): shown in India time like every other audit time. */
  protected readonly lastSeen = computed(() => {
    const raw = this.summary()?.kpis.last_seen;
    const at = raw ? new Date(raw.replace(' ', 'T')) : null;

    return at && !isNaN(at.getTime()) ? at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : null;
  });

  constructor() {
    if (!this.allowed) return;

    // First visit: pin the default period into the URL so the figures and the event list below show the same dates.
    if (!this.route.snapshot.queryParamMap.get('from') && !this.route.snapshot.queryParamMap.get('to')) {
      this.router.navigate([], { relativeTo: this.route, queryParams: rangeDates('30d'), queryParamsHandling: 'merge', replaceUrl: true });
    }

    this.route.queryParamMap.pipe(
      map(p => ({ from: p.get('from') || rangeDates('30d').from, to: p.get('to') || rangeDates('30d').to, r: p.get('r') })),
      tap(r => { this.range.set({ from: r.from, to: r.to }); this.loading.set(true); this.error.set(null); }),
      switchMap(r => this.audit.meSummary({ from: r.from, to: r.to }).pipe(
        catchError(err => { this.error.set(auditError(err)); return of(null); }),
        finalize(() => this.loading.set(false)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(s => this.summary.set(s));
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
