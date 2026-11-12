import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Banner, BannerQuery, BannerSummary, Pagination } from './banner.model';

/** The Banner Management API (`/api/banners`). */
@Injectable({ providedIn: 'root' })
export class BannersService {
  private readonly base = `${environment.apiBaseUrl}banners`;

  constructor(private http: HttpClient) {}

  list(q: BannerQuery): Observable<{ items: Banner[]; pagination: Pagination; summary: BannerSummary }> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    return this.http.get<any>(this.base, { params }).pipe(map((r) => ({ items: r.data as Banner[], pagination: r.pagination as Pagination, summary: r.summary as BannerSummary })));
  }

  get(id: number): Observable<Banner> {
    return this.http.get<any>(`${this.base}/${id}`).pipe(map((r) => r.data as Banner));
  }

  /** Multipart: the image travels with the fields. An update is a POST with `_method=PUT` (a browser cannot send a file in a real PUT). */
  save(form: FormData, id?: number): Observable<Banner> {
    if (id) form.set('_method', 'PUT');
    return this.http.post<any>(id ? `${this.base}/${id}` : this.base, form).pipe(map((r) => r.data as Banner));
  }

  setStatus(id: number, status: boolean): Observable<Banner> {
    return this.http.patch<any>(`${this.base}/${id}/status`, { status }).pipe(map((r) => r.data as Banner));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<any>(`${this.base}/${id}`).pipe(map(() => undefined));
  }

  /** Server message of a failed call (validation text, permission text) for the user. */
  errorMessage(err: any, fallback: string): string {
    const body = err?.error;
    const first = body?.errors ? (Object.values(body.errors).flat() as string[])[0] : null;
    if (err?.status === 429) return 'You are doing that too often. Please wait a minute and try again.';
    return first || body?.message || fallback;
  }
}
