import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { AuditRecordLife, AuditActivityReport, AuditMeSummary, AuditModuleRow, ModuleActivityPage, AuditCall, AuditCallDetail, AuditCallQuery, AuditCallStats, AuditEvent, AuditFilterOptions, AuditPage, AuditQuery, AuditSummary, AuditUserProfile, AuditUserRow } from '../models/audit.model';
import { ApiRoutesConstants } from './api-route-constants';

type ListKind = 'events' | 'changes' | 'security' | 'me';

/** Audit Trail API (read-only). Every call is authorised by the backend; nothing is cached in the browser. */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly api = inject(ApiDataService);
  private readonly base = ApiRoutesConstants.AUDIT;

  summary(query: AuditQuery): Observable<AuditSummary> {
    return this.api.GET(`${this.base}/summary${this.qs(query)}`).pipe(map((r: any) => r.data as AuditSummary));
  }

  list(kind: ListKind, query: AuditQuery): Observable<AuditPage<AuditEvent>> {
    return this.page(`${this.base}/${kind === 'me' ? 'me/events' : kind}${this.qs(query)}`);
  }

  history(type: string, id: string | number, query: AuditQuery = {}): Observable<AuditPage<AuditEvent>> {
    return this.page(`${this.base}/history/${encodeURIComponent(type)}/${encodeURIComponent(String(id))}${this.qs(query)}`);
  }

  /** `own` reads /me/events/{id}: the caller's own event, no admin action needed. */
  /** Where a record was stored, how it travelled, how each field changed and who touched it. */
  record(type: string, id: string | number): Observable<AuditRecordLife> {
    return this.api.GET(`${this.base}/record/${encodeURIComponent(type)}/${encodeURIComponent(String(id))}`).pipe(map((r: any) => r.data as AuditRecordLife));
  }

  event(id: string, own = false): Observable<AuditEvent> {
    return this.api.GET(`${this.base}/${own ? 'me/' : ''}events/${id}`).pipe(map((r: any) => r.data as AuditEvent));
  }

  filters(): Observable<AuditFilterOptions> {
    return this.api.GET(`${this.base}/filters`).pipe(map((r: any) => r.data as AuditFilterOptions));
  }

  /** Filter options built from the caller's own events. */
  meFilters(): Observable<AuditFilterOptions> {
    return this.api.GET(`${this.base}/me/filters`).pipe(map((r: any) => r.data as AuditFilterOptions));
  }

  meSummary(query: Pick<AuditQuery, 'from' | 'to'>): Observable<AuditMeSummary> {
    return this.api.GET(`${this.base}/me/summary${this.qs(query)}`).pipe(map((r: any) => r.data as AuditMeSummary));
  }

  users(query: AuditQuery): Observable<AuditPage<AuditUserRow>> {
    return this.page(`${this.base}/users${this.qs(query)}`);
  }

  user(type: string, id: number, query: Pick<AuditQuery, 'from' | 'to'> = {}): Observable<AuditUserProfile> {
    return this.api.GET(`${this.base}/users/${type}/${id}${this.qs(query)}`).pipe(map((r: any) => r.data as AuditUserProfile));
  }

  /** Server builds the file from the same filters (max 50,000 rows); resolves only after the server finished it. */
  export(query: AuditQuery, format: 'xlsx' | 'csv'): Observable<Blob> {
    return this.api.GET_BLOB(`${this.base}/export${this.qs({ ...query, page: undefined, per_page: undefined, format })}`);
  }

  /** Activity of one sidebar module (parent or sub-module slug), with the hand-offs of its data. */
  moduleActivity(slug: string, query: AuditQuery, overview = false): Observable<ModuleActivityPage> {
    const q = this.qs({ ...query, overview: overview ? 1 : undefined } as AuditQuery);
    return this.api.GET(`${this.base}/module/${encodeURIComponent(slug)}${q}`).pipe(map((r: any) => ({ module: r.module, data: r.data ?? [], pagination: r.pagination, stats: r.stats, overview: r.overview }) as ModuleActivityPage));
  }

  /** One row per module (sub-modules nested) the role can open, zero-event modules included. */
  modules(query: Pick<AuditQuery, 'from' | 'to'>): Observable<{ data: AuditModuleRow[]; period: { from: string; to: string; timezone: string } }> {
    return this.api.GET(`${this.base}/modules${this.qs(query)}`).pipe(map((r: any) => ({ data: (r.data ?? []) as AuditModuleRow[], period: r.period })));
  }

  calls(query: AuditCallQuery): Observable<AuditPage<AuditCall> & { stats: AuditCallStats }> {
    return this.api.GET(`${this.base}/calls${this.qs(query as AuditQuery)}`).pipe(map((r: any) => ({ data: (r.data ?? []) as AuditCall[], pagination: r.pagination, stats: r.stats as AuditCallStats })));
  }

  call(id: number): Observable<AuditCallDetail> {
    return this.api.GET(`${this.base}/calls/${id}`).pipe(map((r: any) => r.data as AuditCallDetail));
  }

  private page<T>(path: string): Observable<AuditPage<T>> {
    return this.api.GET(path).pipe(map((r: any) => ({ data: (r.data ?? []) as T[], pagination: r.pagination })));
  }

  /** Query object -> "?a=1&b[]=x" (empty values dropped). */
  private qs(query: AuditQuery & { format?: string }): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        value.filter(v => v !== '').forEach(v => params.append(`${key}[]`, String(v)));
      } else {
        params.set(key, String(value));
      }
    }
    const text = params.toString();
    return text ? `?${text}` : '';
  }
}
