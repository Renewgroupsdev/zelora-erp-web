import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from './api-route-constants';

export type MetaHealth = 'healthy' | 'attention' | 'error' | 'disconnected';
export type MetaEventStatus = 'received' | 'processing' | 'imported' | 'duplicate' | 'needs_review' | 'retry_pending' | 'permission_issue' | 'failed';

export interface MetaUnit { type: 'branch' | 'franchise'; id: number; key: string; name: string; }

export interface MetaForm {
  id: number;
  form_id: string;
  name: string | null;
  status: string | null;
  branch: MetaUnit | null;
  source_id: number | null;
  source_name: string | null;
  service_category_id: number | null;
}

/** A connected Facebook Page. The API never sends the Page access token. */
export interface MetaConnection {
  id: number;
  page_id: string;
  page_name: string;
  page_category: string | null;
  ad_account_id: string | null;
  status: 'connected' | 'disconnected';
  health: MetaHealth;
  import_enabled: boolean;
  token_status: 'unknown' | 'active' | 'invalid' | 'permission_missing';
  token_checked_at: string | null;
  token_expires_at: string | null;
  permissions: string[] | null;
  missing_permissions: string[];
  webhook_subscribed: boolean;
  last_webhook_at: string | null;
  last_lead_synced_at: string | null;
  last_error: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  branch: MetaUnit | null;
  source_id: number | null;
  source_name: string | null;
  service_category_id: number | null;
  events: Partial<Record<MetaEventStatus, number>>;
  forms: MetaForm[];
}

export interface MetaOverview {
  configured: boolean;
  missing_config: string[];
  authorized: boolean;
  webhook_url: string;
  oauth_redirect_uri: string | null;
  graph_version: string;
  scopes: string[];
  required_permissions: string[];
  queue: { connection: string; runs_inline: boolean; failed_jobs: number | null };
  connections: MetaConnection[];
}

export interface MetaAvailablePage { page_id: string; name: string; category: string | null; connected: boolean; can_connect: boolean; }

export interface MetaTestResult {
  ok: boolean;
  checks: { key: string; label: string; ok: boolean; detail: string }[];
  connection: MetaConnection;
}

export interface MetaMapping {
  import_enabled?: boolean;
  branch_type?: string | null;
  branch_id?: number | null;
  source_id?: number | null;
  service_category_id?: number | null;
  ad_account_id?: string | null;
}

export interface MetaEvent {
  id: number;
  lead_id: string;
  page_id: string | null;
  page_name: string | null;
  form_id: string | null;
  ad_id: string | null;
  status: MetaEventStatus;
  outcome: 'created' | 'merged' | null;
  review_reason: string | null;
  attempts: number;
  deliveries: number;
  error: string | null;
  received_at: string | null;
  processed_at: string | null;
  next_retry_at: string | null;
  crm_lead: { id: number; name: string } | null;
  can_retry: boolean;
  can_resolve: boolean;
}

export interface MetaPagination { current_page: number; last_page: number; per_page: number; total: number; }

export interface MetaEventsPage {
  data: MetaEvent[];
  pagination: MetaPagination;
  summary: { by_status: Partial<Record<MetaEventStatus, number>>; last_imported_at: string | null; last_received_at: string | null };
}

export interface MetaLogRow {
  id: number;
  level: 'info' | 'warning' | 'error';
  event: string;
  message: string;
  context: Record<string, unknown> | null;
  user: string | null;
  event_id: number | null;
  created_at: string;
}

export interface MetaLogsPage { data: MetaLogRow[]; pagination: MetaPagination; }

/** Where a lead came from (lead_source_events), as returned with the lead by GET customer-leads. */
export interface LeadAttribution {
  platform: string | null;
  pageId: string | null;
  pageName: string | null;
  formId: string | null;
  formName: string | null;
  leadId: string | null;
  adId: string | null;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  receivedAt: string | null;
}

/** API lead row -> attribution for the lead screens (undefined for a lead that did not come through Meta). */
export function toLeadAttribution(lead: any): LeadAttribution | undefined {
  const e = lead?.latest_source_event;
  if (!e || e.provider !== 'meta_leadgen') return undefined;

  return {
    platform: e.platform ?? null, pageId: e.page_id ?? null, pageName: e.page_name ?? null,
    formId: e.form_id ?? null, formName: e.form_name ?? null, leadId: e.external_lead_id ?? null,
    adId: e.ad_id ?? null, adName: e.ad_name ?? null, campaignId: e.campaign_id ?? null, campaignName: e.campaign_name ?? null,
    receivedAt: e.source_created_at ?? e.created_at ?? null,
  };
}

/** Settings -> Meta Lead Ads. Every call is server-side; tokens never reach the browser. */
@Injectable({ providedIn: 'root' })
export class MetaIntegrationService {
  private readonly api = inject(ApiDataService);

  overview(): Observable<MetaOverview> {
    return this.api.GET(ApiRoutesConstants.META_INTEGRATION).pipe(map((r: any) => r.data));
  }

  /** The facebook.com URL to send the browser to. */
  startAuthorization(): Observable<string> {
    return this.api.POST(ApiRoutesConstants.META_OAUTH_START, {}).pipe(map((r: any) => r.data.url));
  }

  /** Forgets the stored sign-in and Meta's saved grant, so the next sign-in shows the Page picker again. */
  resetAuthorization(): Observable<void> {
    return this.api.POST(ApiRoutesConstants.META_OAUTH_RESET, {}).pipe(map(() => undefined));
  }

  availablePages(): Observable<{ account: string | null; pages: MetaAvailablePage[] }> {
    return this.api.GET(ApiRoutesConstants.META_OAUTH_PAGES).pipe(map((r: any) => r.data));
  }

  connect(pageId: string, mapping: MetaMapping): Observable<{ connection: MetaConnection; warnings: string[] }> {
    return this.api.POST(ApiRoutesConstants.META_CONNECTIONS, { page_id: pageId, ...mapping }).pipe(map((r: any) => ({ connection: r.data, warnings: r.warnings ?? [] })));
  }

  update(id: number, mapping: MetaMapping): Observable<MetaConnection> {
    return this.api.PUT(`${ApiRoutesConstants.META_CONNECTIONS}/${id}`, mapping).pipe(map((r: any) => r.data));
  }

  updateForm(id: number, formId: number, mapping: MetaMapping): Observable<MetaConnection> {
    return this.api.PUT(`${ApiRoutesConstants.META_CONNECTIONS}/${id}/forms/${formId}`, mapping).pipe(map((r: any) => r.data));
  }

  test(id: number): Observable<MetaTestResult> {
    return this.api.POST(`${ApiRoutesConstants.META_CONNECTIONS}/${id}/test`, {}).pipe(map((r: any) => r.data));
  }

  refreshForms(id: number): Observable<{ connection: MetaConnection; message: string }> {
    return this.api.POST(`${ApiRoutesConstants.META_CONNECTIONS}/${id}/refresh-forms`, {}).pipe(map((r: any) => ({ connection: r.data, message: r.message })));
  }

  disconnect(id: number): Observable<MetaConnection> {
    return this.api.Delete(`${ApiRoutesConstants.META_CONNECTIONS}/${id}`, {}).pipe(map((r: any) => r.data));
  }

  events(query: Record<string, string | number | null | undefined>): Observable<MetaEventsPage> {
    return this.api.GET(`${ApiRoutesConstants.META_EVENTS}?${this.qs(query)}`);
  }

  logs(query: Record<string, string | number | null | undefined>): Observable<MetaLogsPage> {
    return this.api.GET(`${ApiRoutesConstants.META_LOGS}?${this.qs(query)}`);
  }

  retry(eventId: number): Observable<void> {
    return this.api.POST(`${ApiRoutesConstants.META_EVENTS}/${eventId}/retry`, {});
  }

  resolve(eventId: number, mobileNo: string): Observable<void> {
    return this.api.POST(`${ApiRoutesConstants.META_EVENTS}/${eventId}/resolve`, { mobile_no: mobileNo });
  }

  private qs(query: Record<string, string | number | null | undefined>): string {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => v !== null && v !== undefined && v !== '' && params.set(k, String(v)));
    return params.toString();
  }
}
