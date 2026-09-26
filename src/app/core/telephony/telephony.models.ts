/** Shapes returned by the Laravel /api/telephony endpoints. */

export type AgentStatus = 'offline' | 'available' | 'ringing' | 'on_call' | 'wrap_up' | 'busy' | 'break' | 'away';

/** Statuses the telecaller can pick themselves (ringing / on_call / wrap_up are set by the system). */
export const SELECTABLE_AGENT_STATUSES: { value: AgentStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'break', label: 'On Break' },
  { value: 'busy', label: 'Busy' },
  { value: 'away', label: 'Away' },
  { value: 'offline', label: 'Offline' },
];

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  offline: 'Offline',
  available: 'Available',
  ringing: 'Ringing',
  on_call: 'On Call',
  wrap_up: 'Wrap-up',
  busy: 'Busy',
  break: 'On Break',
  away: 'Away',
};

export type CallStatus =
  | 'initiated' | 'ringing' | 'connected' | 'hold'
  | 'completed' | 'missed' | 'rejected' | 'no_answer' | 'busy' | 'failed';

export const LIVE_CALL_STATUSES: CallStatus[] = ['initiated', 'ringing', 'connected', 'hold'];

export interface CallLead {
  id: number;
  name: string;
  mobile_no: string;
  organization_id?: number;
  status_id?: number;
  status_name?: string;
  assigned_to?: number | null;
  assigned_to_name?: string | null;
  source_name?: string;
  service_category_name?: string;
}

export interface CallLog {
  id: number;
  call_id: string;
  direction: 'inbound' | 'outbound';
  status: CallStatus;
  caller_number: string;
  destination_number: string | null;
  employee_id: number | null;
  branch_id: number | null;
  lead?: CallLead | null;
  lead_id?: number | null;
  telecaller?: { id: number; name: string } | null;
  branch?: { id: number; name: string } | null;
  started_at?: string | null;
  ringing_at?: string | null;
  answered_at?: string | null;
  connected_at?: string | null;
  ended_at?: string | null;
  talk_duration?: number;
  hold_duration?: number;
  disposition?: string | null;
  disposed_at?: string | null;
  notes?: string | null;
  recording_url?: string | null;
}

export interface AgentState {
  agent: { status: AgentStatus; current_call_id: number | null; last_seen_at: string | null };
  is_telecaller: boolean;
  is_supervisor: boolean;
  endpoint: string | null;
  ringing_call: CallLog | null;
  active_call: CallLog | null;
  pending_disposition: CallLog | null;
  ring_timeout: number;
}

export interface CallerProfile {
  lead: CallLead | null;
  is_known: boolean;
  recent_calls: CallLog[];
  next_follow_up: { follow_up_date: string; follow_up_time: string | null; type: number } | null;
}

export type DispositionAction = 'none' | 'follow_up' | 'callback' | 'appointment' | 'converted';

export interface CallDisposition {
  id: number;
  code: string;
  label: string;
  action: DispositionAction;
  requires_note: boolean;
}

export interface DispositionPayload {
  disposition: string;
  notes?: string | null;
  lead_id?: number | null;
  follow_up_date?: string | null;
  follow_up_time?: string | null;
  /** 0 general, 1 cool, 2 hot */
  follow_up_type?: number | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  counselor_id?: number | null;
  appointment_reason?: string | null;
}

export interface TelecallerRow {
  id: number;
  name: string;
  phone_no: string | null;
  branch: { id: number; name: string } | null;
  status: AgentStatus;
  assigned_leads_count: number;
  status_changed_at: string | null;
  current_call: Pick<CallLog, 'id' | 'call_id' | 'direction' | 'status' | 'caller_number' | 'destination_number'> | null;
}

export interface CallReportSummary {
  from: string;
  to: string;
  total_calls: number;
  inbound: number;
  outbound: number;
  answered: number;
  missed: number;
  not_connected: number;
  talk_seconds: number;
  avg_talk_seconds: number;
  avg_ring_seconds: number;
  follow_ups: number;
  appointments: number;
  conversions: number;
  answer_rate: number;
  conversion_rate: number;
}

export interface LeadWorkStats {
  assigned: number;
  never_contacted: number;
  follow_ups_today: number;
  follow_ups_overdue: number;
}

/** Outcomes surfaced on the Missed Calls page - a subset of CallStatus plus mid-call drops. */
export type CallAlertStatus = 'no_answer' | 'rejected' | 'busy' | 'failed' | 'disconnected';

/** A call a telecaller didn't handle, shown to branch heads until acknowledged. */
export interface CallAlert {
  id: string;
  callId: number;
  telecallerName: string;
  branchName: string;
  customerNumber: string;
  status: CallAlertStatus;
  occurredAt: string;
  acknowledged: boolean;
}

/** State of the live feed backing TelephonyService.alerts(). */
export type TelephonyConnectionState = 'idle' | 'connecting' | 'live' | 'polling' | 'offline';

export function formatCallDuration(seconds: number | null | undefined): string {
  const value = Math.max(0, Math.floor(Number(seconds ?? 0)));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Number to show for the other party of a call. */
export function customerNumber(call: Pick<CallLog, 'direction' | 'caller_number' | 'destination_number'>): string {
  return (call.direction === 'inbound' ? call.caller_number : call.destination_number) ?? '';
}

/** Badge colour for a call status or an agent status. */
export function callStatusClass(status: string): string {
  if (['completed', 'connected', 'answered', 'available'].includes(status)) return 'success';
  if (['missed', 'rejected', 'failed', 'no_answer', 'busy', 'offline'].includes(status)) return 'danger';
  if (['ringing', 'initiated', 'hold', 'on_call', 'wrap_up'].includes(status)) return 'warning';
  return 'neutral';
}

export function callStatusLabel(status: string): string {
  if (status === 'initiated') return 'Initiated';
  if (status === 'ringing') return 'Ringing';
  if (status === 'connected') return 'Connected';
  if (status === 'hold') return 'On Hold';
  if (status === 'completed') return 'Completed';
  if (status === 'missed') return 'Missed';
  if (status === 'rejected') return 'Rejected';
  if (status === 'no_answer') return 'No Answer';
  if (status === 'busy') return 'Busy';
  if (status === 'failed') return 'Failed';
  if (status === 'disconnected') return 'Disconnected';
  return status;
}

export function agentStatusLabel(status: AgentStatus): string {
  return AGENT_STATUS_LABELS[status] ?? status;
}

export function agentStatusClass(status: AgentStatus): string {
  if (['available'].includes(status)) return 'success';
  if (['offline', 'busy', 'break', 'away'].includes(status)) return 'danger';
  if (['ringing', 'on_call', 'wrap_up'].includes(status)) return 'warning';
  return 'neutral';
}

export function isLiveCallStatus(status: CallStatus): boolean {
  return LIVE_CALL_STATUSES.includes(status);
}

export function isSelectableAgentStatus(status: AgentStatus): boolean {
  return SELECTABLE_AGENT_STATUSES.some((s) => s.value === status);
}

export function isSelectableAgentStatusLabel(label: string): boolean {
  return SELECTABLE_AGENT_STATUSES.some((s) => s.label === label);
}
