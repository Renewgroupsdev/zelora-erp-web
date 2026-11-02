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
  /** "user:12": one person across every linked identity (staff account + HR employee). */
  person?: string;
  /** 1 = every change with its before / after (record history), instead of the three-field preview. */
  detail?: number;
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

export interface AuditUserProfile extends Partial<AuditActivityReport> {
  type: AuditActorType;
  id: number;
  name: string;
  role: string | null;
  code: string | null;
  branch: string | null;
  account_status: string | null;
  stats: { total: number; changes: number; failed_or_denied: number; sign_ins: number; first_seen: string | null; last_seen: string | null };
  linked_identities?: AuditIdentity[];
  period?: AuditPeriod;
  period_total?: number;
  recent_sign_ins?: AuditSignIn[];
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

export interface AuditFlow {
  origin: { handled_by: string | null; from_branch: string | null; record_branch: string | null; source: string; cross_branch: boolean };
  handoffs: { label: string; from: string | null; to: string | null }[];
}

export interface ModuleActivityStats {
  total: number;
  today: number;
  people: number;
  created: number;
  updated: number;
  deleted: number;
}

export interface ModuleActivityPage {
  module: { slug: string; name: string; icon?: string | null; parent_slug?: string | null; parent_name?: string | null };
  overview?: AuditModuleOverview;
  data: (AuditEvent & { flow?: AuditFlow })[];
  pagination: AuditPagination;
  stats: ModuleActivityStats;
}

// ---- My Activity / person view / module-wise views (read-only)

export interface AuditPeriod {
  from: string;
  to: string;
  timezone: string;
}

export interface AuditIdentity {
  type: AuditActorType;
  id: number;
  name: string | null;
  role: string | null;
  code: string | null;
}

/** Events per day / hour of day (0-23) / module for one person, as /audit/me/summary and /audit/users/{type}/{id} return them. */
export interface AuditActivityReport {
  by_day: { day: string; total: number; success: number; failed: number }[];
  by_module: { slug: string; name: string; total: number; last_at: string }[];
  by_hour: { hour: number; total: number }[];
}

export interface AuditSignIn {
  id: string;
  occurred_at: string;
  occurred_at_display: string;
  relative: string;
  outcome: AuditOutcome;
  source: string;
  /** Present only when the API may show network details (my own trail, or view-audit-sensitive). */
  ip?: string | null;
  device?: string | null;
}

export interface AuditPersonStats {
  total: number;
  changes: number;
  failed_or_denied: number;
  sign_ins: number;
  first_seen: string | null;
  last_seen: string | null;
}

export interface AuditMeSummary extends AuditActivityReport {
  period: AuditPeriod;
  person: { identities: AuditIdentity[] };
  kpis: Omit<AuditPersonStats, 'first_seen' | 'last_seen'> & { first_seen: string | null; last_seen: string | null };
  recent_sign_ins: AuditSignIn[];
  recent: AuditEvent[];
}

export interface AuditModuleRow {
  slug: string;
  name: string;
  icon: string | null;
  url: string | null;
  total: number;
  today: number;
  created: number;
  updated: number;
  deleted: number;
  failed_or_denied: number;
  people: number;
  last_activity_at: string | null;
  /** Absent for roles without view-audit-user-activity. */
  top_user: { name: string; total: number } | null;
  sub_modules?: AuditModuleRow[];
}

export interface AuditModuleOverview {
  by_day: AuditActivityReport['by_day'];
  by_sub_module: { slug: string; name: string; total: number }[];
  by_record_type: { type: string | null; name: string; total: number }[];
  top_users: { type: AuditActorType; id: number; name: string; role: string | null; total: number; last_at: string }[];
  top_records: { type: string; type_label: string | null; id: string; label: string | null; total: number; last_at: string }[];
  handoffs: { label: string; total: number }[];
}

// ---- Record history: the whole life of one record (/audit/record/{type}/{id})

export interface AuditRecordWho {
  type: AuditActorType;
  id: number | null;
  name: string | null;
  role: string | null;
  branch: string | null;
}

interface AuditStamp {
  at: string;
  display: string;
  relative: string;
}

export interface AuditJourneyItem {
  field: string;
  label: string;
  masked: boolean;
  /** Null when the role may not see values (view-audit-changes) or the field is sensitive. */
  from: string | null;
  to: string | null;
}

export interface AuditJourneyStep extends AuditStamp {
  id: string;
  kind: 'stored' | 'moved' | 'deleted' | 'restored';
  title: string;
  who: AuditRecordWho;
  items: AuditJourneyItem[];
}

export interface AuditFieldHistory {
  field: string;
  label: string;
  masked: boolean;
  count: number;
  last_at: string | null;
  history: (AuditStamp & { id: string; by: string | null; from: string | null; to: string | null })[];
}

export interface AuditRecordLife {
  record: { type: string; id: string; type_label: string | null; label: string | null; module: string | null; sub_module: string | null };
  state: 'active' | 'deleted' | 'permanently_deleted';
  origin: AuditStamp & {
    stored: boolean;
    note: string | null;
    event_id: string;
    who: AuditRecordWho;
    source: string;
    record_branch: string | null;
    initial: { label: string; value: string }[] | null;
  };
  summary: {
    events: number;
    own_events: number;
    updates: number;
    moves: number;
    child_events: number;
    people: number;
    first_at: string;
    last_at: string;
    last_by: string | null;
    last_event: string;
    values_visible: boolean;
  };
  journey: AuditJourneyStep[];
  /** Records this one came from / was created from, and one start-to-end path over all of them. */
  lineage: { upstream: AuditLineageRecord[]; downstream: AuditLineageRecord[] };
  path: AuditPathStep[];
  fields: AuditFieldHistory[];
  people: { type: AuditActorType; id: number; name: string | null; role: string | null; total: number; last_at: string }[];
}

/** The record a step / card belongs to inside a record's lineage. `relation` is how it relates to the record being viewed. */
export interface AuditRecordRef {
  type: string;
  id: string;
  type_label: string | null;
  label: string | null;
  relation: 'self' | 'upstream' | 'downstream';
}

/** A record linked to the viewed one (came from it / was created from it). `tracked: false` = no visible audit rows. */
export interface AuditLineageRecord {
  type: string;
  id: string;
  type_label: string | null;
  label: string | null;
  tracked: boolean;
  module?: string | null;
  stored_by?: string | null;
  stored?: { at: string; display: string; relative: string };
  last?: { at: string; display: string; relative: string };
  last_event?: string;
  events?: number;
  state?: 'active' | 'deleted';
}

export interface AuditPathStep extends AuditJourneyStep {
  record: AuditRecordRef;
}
