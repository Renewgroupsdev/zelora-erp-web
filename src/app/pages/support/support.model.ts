/** Contract of the Help Desk API (/api/support/..., Laravel App\Services\Support). */

export type TicketStatus = 'new' | 'open' | 'assigned' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'closed' | 'reopened';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SupportOption { value: string; label: string; }

export interface SupportConfig {
  support_phone: string;
  support_whatsapp: string | null;
  support_email: string | null;
  support_hours: string | null;
  support_availability: string | null;
  categories: { id: number; category_name: string; description: string | null }[];
  modules: string[];
  priorities: SupportOption[];
  statuses: SupportOption[];
  attachments: { max_files: number; max_kb: number; allowed_extensions: string[]; image_extensions: string[] };
}

export interface TicketSummary {
  ticket_number: string;
  title: string;
  category: string | null;
  affected_module: string | null;
  priority: TicketPriority;
  priority_label: string;
  status: TicketStatus;
  status_label: string;
  application_type: string;
  assigned_to: { id: number | null; name: string | null } | null;
  created_at: string;
  updated_at: string;
  due_at: string | null;
  is_overdue: boolean;
  escalation_level: number | null;
  reporter?: { type: 'customer' | 'employee'; id: number; name: string };
}

export interface TicketAttachment {
  id: number; file_name: string; file_type: string | null; file_size: number; is_image: boolean; url: string; created_at: string; is_internal?: boolean;
}

export interface TicketMessage {
  id: number; sender_type: 'customer' | 'employee' | 'support'; sender_name: string; is_mine_side: boolean; is_internal_note: boolean;
  message: string; attachments: TicketAttachment[]; created_at: string;
}

export interface TicketHistoryItem {
  event: string; old_status: string | null; old_status_label: string | null; new_status: string | null; new_status_label: string | null;
  changed_by: string; changed_by_type: string | null; remarks: string | null; created_at: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  affected_screen: string | null;
  page_url: string | null;
  application_version: string | null;
  device_information: Record<string, string> | null;
  browser_information: string | null;
  attachments: TicketAttachment[];
  messages: TicketMessage[];
  history: TicketHistoryItem[];
  resolution_description: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  first_response_at: string | null;
  reopened_count: number;
  satisfaction_rating: number | null;
  satisfaction_comment: string | null;
  can_reply: boolean;
  can_reopen: boolean;
  can_confirm_resolution: boolean;
}

export interface Pagination { current_page: number; last_page: number; per_page: number; total: number; from?: number | null; to?: number | null; }

export interface DashboardData {
  cards: Record<'total' | 'new' | 'open' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'closed' | 'overdue' | 'unassigned', number>;
  by_status: { key: string; label: string; value: number }[];
  by_category: { label: string; value: number }[];
  by_priority: { key: string; label: string; value: number }[];
  by_user_type: { key: string; label: string; value: number }[];
  trend: { unit: string; points: { period: string; created: number; resolved: number }[] };
  avg_resolution_hours: number | null;
  avg_first_response_hours: number | null;
  avg_satisfaction: number | null;
}

export interface SupportSettings {
  support_phone: string; support_whatsapp: string | null; support_email: string | null; support_hours: string | null; support_availability: string | null;
  email_notifications: string; sla_hours_low: number; sla_hours_medium: number; sla_hours_high: number; sla_hours_critical: number;
}

export interface AdminCategory { id: number; category_name: string; description: string | null; audience: 'both' | 'customer' | 'employee'; sort_order: number; is_active: boolean; }

/** The "my tickets" chips: what each one asks the API for. */
export const MY_TICKET_FILTERS: { key: string; label: string; status: string }[] = [
  { key: 'all', label: 'All Tickets', status: 'all' },
  { key: 'open', label: 'Open', status: 'new,open,assigned,reopened' },
  { key: 'progress', label: 'In Progress', status: 'in_progress' },
  { key: 'waiting', label: 'Waiting for Response', status: 'waiting_for_user' },
  { key: 'resolved', label: 'Resolved', status: 'resolved' },
  { key: 'closed', label: 'Closed', status: 'closed' },
];

/** Status tone for the coloured badge (same words in the mobile apps). */
export function statusTone(status: string): 'blue' | 'purple' | 'orange' | 'green' | 'gray' | 'red' {
  switch (status) {
    case 'new': return 'blue';
    case 'open': case 'assigned': return 'purple';
    case 'in_progress': return 'orange';
    case 'waiting_for_user': return 'red';
    case 'resolved': return 'green';
    case 'reopened': return 'red';
    default: return 'gray';
  }
}

export function priorityTone(priority: string): 'gray' | 'blue' | 'orange' | 'red' {
  return priority === 'critical' ? 'red' : priority === 'high' ? 'orange' : priority === 'medium' ? 'blue' : 'gray';
}
