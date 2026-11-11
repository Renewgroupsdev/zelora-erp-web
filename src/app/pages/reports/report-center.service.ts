import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReportCard, ReportCategory, ReportChart, ReportFormat, ReportMeta, ReportOption, ReportPagination, ReportPreset, ReportQuery } from './report-center.model';

export interface ReportPage {
  rows: Record<string, any>[];
  pagination: ReportPagination;
}

/** The /report-center API. The scope headers (branch / franchise) are added by the auth interceptor like every call. */
@Injectable({ providedIn: 'root' })
export class ReportCenterService {
  private readonly base = `${environment.apiBaseUrl}report-center`;

  constructor(private http: HttpClient) {}

  catalog(): Observable<ReportMeta[]> {
    return this.catalogWithSections().pipe(map((c) => c.reports));
  }

  /** The reports this role may open plus the page sections (icon, hint, colour) - both from the server. */
  catalogWithSections(): Observable<{ reports: ReportMeta[]; categories: ReportCategory[] }> {
    return this.http.get<any>(`${this.base}/catalog`).pipe(map((r) => ({ reports: r?.data ?? [], categories: r?.categories ?? [] })));
  }

  /* ------------------------------------------------------------------ recently viewed + the view each report was last left in */

  /** Slugs of the reports this browser opened last, newest first. */
  recent(): string[] {
    try {
      const list = JSON.parse(localStorage.getItem('zelora.report.recent') || '[]');
      return Array.isArray(list) ? list.filter((s) => typeof s === 'string').slice(0, 6) : [];
    } catch {
      return [];
    }
  }

  markRecent(slug: string): void {
    try {
      localStorage.setItem('zelora.report.recent', JSON.stringify([slug, ...this.recent().filter((s) => s !== slug)].slice(0, 6)));
    } catch { /* storage may be blocked: the list just is not remembered */ }
  }

  /** Download a report exactly as it was last left on screen (its remembered filters, search and sort), every matching row. */
  exportLast(slug: string, format: ReportFormat): Observable<{ blob: Blob; fileName: string }> {
    let saved: Record<string, string> = {};
    try {
      saved = JSON.parse(localStorage.getItem(`zelora.report.last.${slug}`) || '{}');
    } catch { /* no remembered view: export everything */ }
    const p = new URLSearchParams({ format });
    if (saved['p'] === 'custom' && saved['from'] && saved['to']) {
      p.set('date_preset', 'custom');
      p.set('date_from', saved['from']);
      p.set('date_to', saved['to']);
    } else if (saved['p'] && saved['p'] !== 'custom') {
      p.set('date_preset', saved['p']);
    }
    if (saved['q']) p.set('search', saved['q']);
    if (saved['sort']) p.set('sort', saved['sort']);
    for (const [key, value] of Object.entries(saved)) {
      const range = key.match(/^f\.(.+)\.(min|max)$/);
      const plain = key.match(/^f\.(.+)$/);
      if (range) p.set(`f[${range[1]}][${range[2]}]`, value);
      else if (plain) value.split('|').filter(Boolean).forEach((v) => p.append(`f[${plain[1]}][]`, v));
    }

    return this.http.get(`${this.base}/${slug}/export?${p.toString()}`, { responseType: 'blob', observe: 'response' }).pipe(
      map((res: HttpResponse<Blob>) => ({ blob: res.body as Blob, fileName: this.fileName(res.headers.get('content-disposition')) ?? `${slug}.${format}` }))
    );
  }
  page(slug: string, q: ReportQuery): Observable<ReportPage> {
    return this.http.get<any>(`${this.base}/${slug}?${this.queryString(q, true)}`).pipe(
      map((r) => ({ rows: r?.data ?? [], pagination: r?.pagination as ReportPagination }))
    );
  }

  summary(slug: string, q: ReportQuery): Observable<{ cards: ReportCard[]; chart: ReportChart | null }> {
    return this.http.get<any>(`${this.base}/${slug}/summary?${this.queryString(q, false)}`).pipe(map((r) => r?.data));
  }

  options(slug: string): Observable<Record<string, ReportOption[]>> {
    return this.http.get<any>(`${this.base}/${slug}/options`).pipe(map((r) => r?.data ?? {}));
  }

  /** Same parameters as the table, minus page / per_page, so the file holds every matching row. */
  export(slug: string, q: ReportQuery, format: ReportFormat): Observable<{ blob: Blob; fileName: string }> {
    return this.http.get(`${this.base}/${slug}/export?format=${format}&${this.queryString(q, false)}`, { responseType: 'blob', observe: 'response' }).pipe(
      map((res: HttpResponse<Blob>) => ({
        blob: res.body as Blob,
        fileName: this.fileName(res.headers.get('content-disposition')) ?? `${slug}.${format}`,
      }))
    );
  }

  presets(slug: string): Observable<ReportPreset[]> {
    return this.http.get<any>(`${this.base}/${slug}/presets`).pipe(map((r) => r?.data ?? []));
  }

  savePreset(slug: string, name: string, q: ReportQuery): Observable<ReportPreset> {
    const params: Record<string, unknown> = {};
    const qs = new URLSearchParams(this.queryString({ ...q, page: 1 }, false));
    // the stored form is the API's own query shape, so applying it later needs no translation
    const f: Record<string, unknown> = {};
    qs.forEach((value, key) => {
      const m = key.match(/^f\[([^\]]+)\](?:\[(\w*)\])?$/);
      if (m) {
        const [, k, sub] = m;
        if (sub === '') (f[k] = (f[k] as string[] | undefined) ?? []), (f[k] as string[]).push(value);
        else if (sub) f[k] = { ...((f[k] as object) ?? {}), [sub]: value };
        else f[k] = value;
      } else {
        params[key] = value;
      }
    });
    if (Object.keys(f).length) params['f'] = f;
    delete params['per_page'];
    return this.http.post<any>(`${this.base}/${slug}/presets`, { name, filters: params }).pipe(map((r) => r?.data));
  }

  deletePreset(slug: string, id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/${slug}/presets/${id}`);
  }

  /** The API's query string for a query. */
  queryString(q: ReportQuery, paged: boolean): string {
    const p = new URLSearchParams();
    if (q.preset && q.preset !== 'custom') p.set('date_preset', q.preset);
    if (q.preset === 'custom' && q.from && q.to) {
      p.set('date_preset', 'custom');
      p.set('date_from', q.from);
      p.set('date_to', q.to);
    }
    if (q.search.trim()) p.set('search', q.search.trim());
    for (const [key, v] of Object.entries(q.filters)) {
      if (Array.isArray(v)) v.forEach((x) => p.append(`f[${key}][]`, x));
      else if (typeof v === 'object') {
        if (v.min !== undefined && v.min !== '') p.set(`f[${key}][min]`, v.min);
        if (v.max !== undefined && v.max !== '') p.set(`f[${key}][max]`, v.max);
      } else if (v !== '') p.set(`f[${key}]`, v);
    }
    if (q.sort.length) p.set('sort', q.sort.map((s) => `${s.key}:${s.dir}`).join(','));
    if (paged) {
      p.set('page', String(q.page));
      p.set('per_page', String(q.perPage));
    }
    return p.toString();
  }

  /** A readable message out of an error - for a blob body (export) the JSON is read from the blob first. */
  async errorMessage(err: unknown, fallback: string): Promise<string> {
    if (!(err instanceof HttpErrorResponse)) return fallback;
    let body: any = err.error;
    if (body instanceof Blob) {
      try {
        body = JSON.parse(await body.text());
      } catch {
        return fallback;
      }
    }
    if (err.status === 403) return body?.message || 'Your role does not have permission for this.';
    if (err.status === 429) return 'Too many requests. Please wait a moment and try again.';
    return body?.message || fallback;
  }

  private fileName(header: string | null): string | null {
    const m = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);

    return m ? decodeURIComponent(m[1]) : null;
  }
}
