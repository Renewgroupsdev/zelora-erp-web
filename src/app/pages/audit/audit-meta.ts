import { ParamMap } from '@angular/router';
import { AuditEvent, AuditOutcome, AuditQuery, AuditSeverity } from '../../shared/models/audit.model';

export type Tone = 'green' | 'blue' | 'red' | 'orange' | 'purple' | 'gray' | 'teal';

/** Icon + colour per event type. Colour is never the only signal: every badge also carries the event label. */
export const EVENT_META: Record<string, { icon: string; tone: Tone }> = {
  created: { icon: 'bi-plus-circle-fill', tone: 'green' },
  updated: { icon: 'bi-pencil-fill', tone: 'blue' },
  deleted: { icon: 'bi-trash3-fill', tone: 'red' },
  force_deleted: { icon: 'bi-trash3-fill', tone: 'red' },
  restored: { icon: 'bi-arrow-counterclockwise', tone: 'purple' },
  login: { icon: 'bi-box-arrow-in-right', tone: 'gray' },
  logout: { icon: 'bi-box-arrow-right', tone: 'gray' },
  login_failed: { icon: 'bi-exclamation-triangle-fill', tone: 'orange' },
  access_denied: { icon: 'bi-slash-circle-fill', tone: 'orange' },
  permission_changed: { icon: 'bi-shield-lock-fill', tone: 'purple' },
  password_changed: { icon: 'bi-key-fill', tone: 'blue' },
  password_reset: { icon: 'bi-key-fill', tone: 'blue' },
  exported: { icon: 'bi-download', tone: 'teal' },
};

export function eventMeta(event: string): { icon: string; tone: Tone } {
  return EVENT_META[event] ?? { icon: 'bi-record-circle', tone: 'gray' };
}

export const OUTCOME_LABEL: Record<AuditOutcome, string> = { success: 'Success', failed: 'Failed', denied: 'Denied' };
export const OUTCOME_TONE: Record<AuditOutcome, Tone> = { success: 'green', failed: 'red', denied: 'orange' };
export const SEVERITY_LABEL: Record<AuditSeverity, string> = { info: 'Info', notice: 'Notice', warning: 'Warning', high: 'High' };
export const SEVERITY_TONE: Record<AuditSeverity, Tone> = { info: 'gray', notice: 'blue', warning: 'orange', high: 'red' };
export const SOURCE_LABEL: Record<string, string> = { web: 'Web app', mobile: 'Mobile app', api: 'API', webhook: 'Webhook', system: 'System', console: 'Scheduler / console' };

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

export function actorInitials(name: string | null | undefined): string {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** "Record" cell text: "Lead: Ravi Kumar" or "-". */
export function recordText(e: AuditEvent): string {
  const { type_label, label } = e.record;
  return type_label ? `${type_label}${label ? ': ' + label : ''}` : '-';
}

export function moduleText(e: AuditEvent): string {
  return [e.module.name, e.sub_module.name].filter(Boolean).join(' › ') || '-';
}

export function isoDay(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export type RangeKey = 'today' | '7d' | '30d' | '90d';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];

export function rangeDates(key: RangeKey): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - ({ today: 0, '7d': 6, '30d': 29, '90d': 89 } as const)[key]);
  return { from: isoDay(from), to: isoDay(to) };
}

/** URL query params -> API query. Opened event id is `ev` and is not a filter. */
export function queryFromParams(p: ParamMap): AuditQuery {
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(',').filter(Boolean) : undefined);
  const actor = p.get('actor')?.split(':');
  const num = (k: string, d: number) => (Number.isFinite(Number(p.get(k))) && Number(p.get(k)) > 0 ? Number(p.get(k)) : d);
  return {
    search: p.get('q') ?? undefined,
    from: p.get('from') ?? undefined,
    to: p.get('to') ?? undefined,
    module: p.get('module') ?? undefined,
    sub_module: p.get('sub') ?? undefined,
    event: list('types'),
    outcome: list('outcome'),
    severity: list('severity'),
    source: p.get('source') ?? undefined,
    request_id: p.get('request') ?? undefined,
    auditable_type: p.get('rt') ?? undefined,
    auditable_id: p.get('rid') ?? undefined,
    actor_type: actor?.[0] || undefined,
    actor_id: actor?.[1] ? Number(actor[1]) : undefined,
    page: num('page', 1),
    per_page: num('size', 25),
    sort_by: p.get('sort') ?? undefined,
    sort_direction: p.get('dir') === 'asc' ? 'asc' : p.get('dir') === 'desc' ? 'desc' : undefined,
  };
}

/** API query -> URL query params (defaults dropped so URLs stay short). */
export function paramsFromQuery(q: AuditQuery): Record<string, string | null> {
  const join = (v?: string[]) => (v && v.length ? v.join(',') : null);
  return {
    q: q.search || null,
    from: q.from || null,
    to: q.to || null,
    module: q.module || null,
    sub: q.sub_module || null,
    types: join(q.event),
    outcome: join(q.outcome),
    severity: join(q.severity),
    source: q.source || null,
    request: q.request_id || null,
    rt: q.auditable_type || null,
    rid: q.auditable_id || null,
    actor: q.actor_type && q.actor_id ? `${q.actor_type}:${q.actor_id}` : null,
    page: q.page && q.page > 1 ? String(q.page) : null,
    size: q.per_page && q.per_page !== 25 ? String(q.per_page) : null,
    sort: q.sort_by || null,
    dir: q.sort_by && q.sort_direction ? q.sort_direction : null,
  };
}

/** 37 -> "37s", 125 -> "2m 05s", 3700 -> "1h 01m". */
export function duration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (s < 60) return `${s}s`;
  const p = (n: number) => String(n).padStart(2, '0');
  if (s < 3600) return `${Math.floor(s / 60)}m ${p(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${p(Math.floor((s % 3600) / 60))}m`;
}

/** Day heading for timeline groups, from an ISO timestamp that already carries the IST offset. */
export function dayHeading(iso: string): { key: string; label: string } {
  const key = iso.slice(0, 10);
  const today = isoDay(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === today) return { key, label: 'Today' };
  if (key === isoDay(y)) return { key, label: 'Yesterday' };
  const d = new Date(`${key}T00:00:00`);
  return { key, label: d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }) };
}

/** Clock part of "28 Oct 2026, 12:59:08 PM" -> "12:59 PM". */
export function clock(display: string): string {
  const m = display.match(/(\d{1,2}:\d{2}):\d{2}\s*([AP]M)/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : display;
}

export const CALL_STATUS_TONE: Record<string, Tone> = {
  completed: 'green', connected: 'blue', ringing: 'blue', initiated: 'gray', hold: 'orange', waiting: 'orange',
  missed: 'red', no_answer: 'orange', rejected: 'red', busy: 'orange', failed: 'red',
};

/** Human message for an HTTP error from the audit API. */
export function auditError(err: any): { kind: 'forbidden' | 'auth' | 'validation' | 'network' | 'server'; message: string } {
  const status = err?.status;
  if (status === 403) return { kind: 'forbidden', message: err?.error?.message || 'Your role does not have permission to view this.' };
  if (status === 401) return { kind: 'auth', message: 'Your session has expired. Please sign in again.' };
  if (status === 422) {
    const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[] | string) : null;
    return { kind: 'validation', message: (Array.isArray(first) ? first[0] : first) || err?.error?.message || 'Some filters are not valid.' };
  }
  if (status === 0) return { kind: 'network', message: 'Cannot reach the server. Check your connection and try again.' };
  return { kind: 'server', message: err?.error?.message || 'The server could not complete this request. Please try again.' };
}
