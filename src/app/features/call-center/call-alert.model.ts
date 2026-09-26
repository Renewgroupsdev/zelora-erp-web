/** Branch-head escalation raised by a missed, rejected or unassigned call. */
export interface CallAlert {
  id: number;
  call_log_id: number;
  title: string;
  message: string;
  priority: string;
  status: string;
  triggered_at: string;
  call?: { caller_number: string } | null;
}
