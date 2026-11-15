import { HttpClient, HttpEvent, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminCategory, DashboardData, Pagination, SupportConfig, SupportSettings, TicketDetail, TicketSummary } from './support.model';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

/** The Help Desk API: the signed-in user's own tickets (`support/...`) and the support team's desk (`support/admin/...`). */
@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly base = `${environment.apiBaseUrl}support`;
  private readonly admin = `${environment.apiBaseUrl}support/admin`;
  private readonly blobs = new Map<string, string>();

  constructor(private http: HttpClient) {}

  private params(o: Record<string, unknown>): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== '' && v !== false) p = p.set(k, String(v));
    return p;
  }

  private data<T>(o: Observable<any>): Observable<T> {
    return o.pipe(map((r) => r?.data as T));
  }

  /* ---------------------------------------------------------------- my tickets */

  config(): Observable<SupportConfig> {
    return this.data(this.http.get(`${this.base}/config`));
  }

  myTickets(q: { status?: string; search?: string; page?: number; per_page?: number }): Observable<{ items: TicketSummary[]; pagination: Pagination }> {
    return this.data(this.http.get(`${this.base}/tickets`, { params: this.params(q) }));
  }

  /** Multipart so screenshots travel with the report; the event stream gives the upload progress. */
  createTicket(form: FormData): Observable<HttpEvent<any>> {
    return this.http.post(`${this.base}/tickets`, form, { reportProgress: true, observe: 'events' });
  }

  ticket(no: string, admin = false): Observable<TicketDetail> {
    return this.data(this.http.get(`${admin ? this.admin : this.base}/tickets/${no}`));
  }

  sendMessage(no: string, form: FormData, admin = false): Observable<TicketDetail> {
    return this.data(this.http.post(`${admin ? this.admin : this.base}/tickets/${no}/messages`, form));
  }

  addFiles(no: string, form: FormData, admin = false): Observable<TicketDetail> {
    return this.data(this.http.post(`${admin ? this.admin : this.base}/tickets/${no}/attachments`, form));
  }

  reopen(no: string, remarks: string): Observable<TicketDetail> {
    return this.data(this.http.post(`${this.base}/tickets/${no}/reopen`, { remarks }));
  }

  confirmResolution(no: string, rating: number | null, comment: string): Observable<TicketDetail> {
    return this.data(this.http.post(`${this.base}/tickets/${no}/confirm-resolution`, { rating, comment }));
  }

  unreadCount(): Observable<number> {
    return this.http.get<any>(`${this.base}/notifications/unread-count`).pipe(map((r) => r?.data?.unread_count ?? 0));
  }

  /** A private attachment as an object URL (the file needs the login, so an <img src> cannot fetch it directly). */
  blobUrl(apiPath: string): Observable<string> {
    const cached = this.blobs.get(apiPath);
    if (cached) return of(cached);
    return this.http.get(`${environment.apiBaseUrl}${apiPath.replace(/^\/api\//, '')}`, { responseType: 'blob' }).pipe(
      map((b) => URL.createObjectURL(b)),
      tap((u) => this.blobs.set(apiPath, u)),
    );
  }

  /** Download a non-image attachment with its real name. */
  download(apiPath: string): Observable<Blob> {
    return this.http.get(`${environment.apiBaseUrl}${apiPath.replace(/^\/api\//, '')}`, { responseType: 'blob' });
  }

  /* ---------------------------------------------------------------- the support team */

  dashboard(q: Record<string, unknown>): Observable<DashboardData> {
    return this.data(this.http.get(`${this.admin}/dashboard`, { params: this.params(q) }));
  }

  allTickets(q: Record<string, unknown>): Observable<{ items: TicketSummary[]; pagination: Pagination }> {
    return this.http.get<any>(`${this.admin}/tickets`, { params: this.params(q) }).pipe(map((r) => ({ items: r?.data ?? [], pagination: r?.pagination as Pagination })));
  }

  exportTickets(format: ExportFormat, q: Record<string, unknown>): Observable<{ blob: Blob; fileName: string }> {
    return this.http.get(`${this.admin}/tickets/export`, { params: this.params({ ...q, format }), responseType: 'blob', observe: 'response' }).pipe(
      map((res: HttpResponse<Blob>) => ({
        blob: res.body as Blob,
        fileName: decodeURIComponent((res.headers.get('content-disposition')?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i) ?? [])[1] ?? `support-tickets.${format}`),
      })),
    );
  }

  agents(): Observable<{ id: number; name: string }[]> {
    return this.data(this.http.get(`${this.admin}/agents`));
  }

  /** A change on one ticket (assign, priority, status, resolve, close, reopen, escalate, request-info, notes). Answers the refreshed ticket. */
  act(no: string, action: string, body: Record<string, unknown> | FormData = {}, method: 'post' | 'patch' = 'post'): Observable<TicketDetail> {
    return this.data(this.http.request(method, `${this.admin}/tickets/${no}/${action}`, { body }));
  }

  settings(): Observable<SupportSettings> {
    return this.data(this.http.get(`${this.admin}/settings`));
  }

  saveSettings(body: Partial<SupportSettings>): Observable<SupportSettings> {
    return this.data(this.http.put(`${this.admin}/settings`, body));
  }

  categories(): Observable<AdminCategory[]> {
    return this.data(this.http.get(`${this.admin}/categories`));
  }

  saveCategory(c: Partial<AdminCategory>): Observable<AdminCategory> {
    return this.data(c.id ? this.http.put(`${this.admin}/categories/${c.id}`, c) : this.http.post(`${this.admin}/categories`, c));
  }

  /** Server message of a failed call (validation text, permission text) for the user. */
  async errorMessage(err: any, fallback: string): Promise<string> {
    let body = err?.error;
    if (body instanceof Blob) {
      try { body = JSON.parse(await body.text()); } catch { return fallback; }
    }
    const first = body?.errors ? (Object.values(body.errors).flat() as string[])[0] : null;
    if (err?.status === 429) return 'You are doing that too often. Please wait a minute and try again.';
    return first || body?.message || fallback;
  }
}
