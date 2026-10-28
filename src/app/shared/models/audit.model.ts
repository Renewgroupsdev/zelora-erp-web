export type AuditOutcome = 'success' | 'failed' | 'denied';
export type AuditSeverity = 'info' | 'notice' | 'warning' | 'high';
export type AuditActorType = 'user' | 'employee' | 'customer' | 'system' | 'webhook' | 'console';

export interface AuditChange {
  field: string;
  label: string;
  masked: boolean;
  old: string | null;
  new: string | null;
}

export interface AuditChangePreview {
  label: string;
  masked: boolean;
  old: string | null;
  new: string | null;
}

/** One audit row as the API returns it. Optional blocks are absent (not blank) when the role may not see them. */
export interface AuditEvent {
  id: string;
  occurred_at: string;
  occurred_at_display: string;
  timezone: string;
  relative: string;
  event: string;
  event_label: string;
  outcome: AuditOutcome;
  severity: AuditSeverity;
  source: string;
  module: { slug: string | null; name: string | null };
  sub_module: { slug: string | null; name: string | null };
  record: { type: string | null; type_label: string | null; id: string | null; label: string | null; parent_type: string | null; parent_id: string | null };
  related: { lead_id: number | null };
  description: string;
  actor: { type: AuditActorType; id: number | null; name: string | null; role: string | null; code: string | null; branch: string | null };
  changed_fields: number;
  has_changes: boolean;
  changed_field_labels: string[];
  request_id: string | null;
  batch_id: string | null;
  changes?: AuditChange[];
  changes_preview?: AuditChangePreview[];
  network?: { ip: string | null; device: string | null; method: string | null; route: string | null; url?: string | null; user_agent?: string | null };
  extra?: Record<string, unknown> | null;
}

export interface AuditPagination {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface AuditPage<T> {
  data: T[];
  pagination: AuditPagination;
}

/** Filters shared by every audit list. Mirrors the API query string. */
export interface AuditQuery {
  search?: string;
  from?: string;
  to?: string;
  module?: string;
  sub_module?: string;
  event?: string[];
  outcome?: string[];
  severity?: string[];
  source?: string;
  actor_type?: string;
  actor_id?: number | null;
  auditable_type?: string;
  auditable_id?: string;
  request_id?: string;
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_direction?: 'asc' | 'desc';
}

export interface AuditFilterOptions {
  modules: { slug: string; name: string; sub_modules: { slug: string; name: string }[] }[];
  events: { value: string; label: string }[];
  outcomes: AuditOutcome[];
  severities: AuditSeverity[];
  sources: string[];
  users?: { type: AuditActorType; id: number; name: string; role: string | null }[];
}

export interface AuditSummary {
  period: { from: string | null; to: string | null; timezone: string };
  kpis: { total: number; successful: number; failed_or_denied: number; high_severity: number; active_users: number };
  by_day: { day: string; total: number; success: number; failed: number }[];
  by_module: { name: string; total: number }[];
  by_event: { event: string; label: string; total: number }[];
  by_outcome: { outcome: AuditOutcome; total: number }[];
  top_users?: { type: AuditActorType; id: number; name: string; role: string | null; total: number }[];
  recent?: AuditEvent[];
  high_priority?: AuditEvent[];
}

export interface AuditUserRow {
  type: AuditActorType;
  id: number;
  name: string;
  role: string | null;
  code: string | null;
  branch: string | null;
  total: number;
  failed: number;
  last_at: string;
}

export interface AuditUserProfile {
  type: AuditActorType;
  id: number;
  name: string;
  role: string | null;
  code: string | null;
  branch: string | null;
  account_status: string | null;
  stats: { total: number; changes: number; failed_or_denied: number; sign_ins: number; first_seen: string | null; last_seen: string | null };
}

export interface AuditTime {
  iso: string;
  display: string;
  relative: string;
}

/** One call (call_logs + its caller_history notes) as Audit Trail -> Call History shows it. */
export interface AuditCall {
  id: number;
  call_id: string;
  direction: 'inbound' | 'outbound' | string;
  status: string;
  status_label: string;
  outcome: string | null;
  lead: { id: number; name: string; mobile: string | null } | null;
  number: string | null;
  telecaller: { id: number; name: string; emp_code: string | null } | null;
  branch: string | null;
  started_at: AuditTime | null;
  ended_at: AuditTime | null;
  talk_seconds: number;
  notes: string | null;
  recording_url: string | null;
}

export interface AuditCallDetail extends AuditCall {
  queue: string | null;
  extension: string | null;
  provider: string | null;
  provider_status: string | null;
  ring_seconds: number;
  hold_seconds: number;
  total_seconds: number;
  answered_at: AuditTime | null;
  disposed_at: AuditTime | null;
  timeline: { type: string; label: string; at: AuditTime | null; by: string | null }[];
  assignments: { telecaller: string | null; type: string | null; status: string; assigned_at: AuditTime | null; accepted_at: AuditTime | null; ended_at: AuditTime | null }[];
  call_notes: { by: string | null; note: string; at: AuditTime | null }[];
  recordings: { url: string | null; duration_seconds: number; status: string | null }[];
}

export interface AuditCallStats {
  total: number;
  answered: number;
  missed: number;
  inbound: number;
  outbound: number;
  avg_talk_seconds: number;
  total_talk_seconds: number;
}

export interface AuditCallQuery {
  search?: string;
  from?: string;
  to?: string;
  lead_id?: number;
  telecaller_id?: number;
  direction?: string;
  outcome?: string;
  page?: number;
  per_page?: number;
}
