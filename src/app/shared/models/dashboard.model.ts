/** Role based dashboard (GET /api/dashboard/{widget}?range=...). Each widget is a Dashboard action on Roles & Permissions. */

export type DashRange = 'today' | '7d' | '30d' | 'month' | 'quarter' | 'year';

export const DASH_RANGES: { key: DashRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

/** Widget endpoint => the Roles & Permissions action that unlocks it (config/module_actions.php 'dashboard'). */
export const DASH_WIDGETS = {
  kpis: 'dashboard-kpis',
  finance: 'dashboard-finance',
  leads: 'dashboard-leads',
  appointments: 'dashboard-appointments',
  units: 'dashboard-units',
  hr: 'dashboard-hr',
  stock: 'dashboard-stock',
  approvals: 'dashboard-approvals',
  telecalling: 'dashboard-telecalling',
  'front-desk': 'dashboard-front-desk',
  'my-day': 'dashboard-my-day',
  'doctor-day': 'dashboard-doctor-day',
  'my-work': 'dashboard-my-work',
  customer: 'dashboard-customer',
} as const;

export type DashWidgetKey = keyof typeof DASH_WIDGETS;

export interface DashPeriod {
  range: DashRange | 'custom';
  from: string;
  to: string;
  previous_from: string;
  previous_to: string;
  granularity: 'day' | 'month';
}

export interface Kpi { value: number; previous: number | null; change: number | null; rate?: number; }
export interface LabelValue { label: string; value: number; }

export interface KpisData {
  collections: Kpi; sales: Kpi; new_leads: Kpi; conversion_rate: Kpi; new_customers: Kpi; appointments: Kpi;
  active_customers: Kpi; appointments_today: Kpi; headcount: Kpi; present_today: Kpi; stock_value: Kpi;
}

export interface FinanceData {
  income: Kpi; expense: Kpi; net: Kpi; margin: number; outstanding: number;
  income_split: LabelValue[]; expense_split: LabelValue[];
  trend: { key: string; label: string; income: number; expense: number; net: number }[];
}

export interface LeadsData {
  total: number; unassigned: number; conversion_rate: number;
  funnel: LabelValue[]; by_status: LabelValue[]; by_source: LabelValue[]; trend: LabelValue[];
}

export interface VisitRow {
  id: number; name: string; type: string; status: string; time: string | null; category: string | null;
  doctor: string | null; treatment: string | null;
}

export interface AppointmentsData {
  status_mix: LabelValue[]; by_treatment: (LabelValue & { plans: number })[];
  sittings_today: number; sittings_overdue: number; sittings_completed: number; today: VisitRow[];
}

export interface UnitRow {
  key: string; type: 'branch' | 'franchise'; id: number; code: string; name: string; photo: string | null;
  revenue: number; leads: number; new_customers: number; appointments: number;
}
export interface UnitsData { units: UnitRow[]; total_revenue: number; }

export interface HrData {
  headcount: number; by_department: LabelValue[]; by_status: LabelValue[];
  attendance_today: { present: number; late: number; half_day: number; on_leave: number; permission: number; not_marked: number; rate: number };
  on_leave_today: { name: string; designation: string; type: string; to: string }[];
  payroll_last_month: { month: string; employees: number; gross: number; net: number };
  joiners: number; open_positions: number;
}

export interface StockData {
  value: number; units: number; products: number; threshold: number;
  low_stock_count: number; low_stock: { product: string; store: string; qty: number }[];
  expiring_count: number; expiring: { product: string; batch: string; qty: number; expiry: string; store: string; expired: boolean }[];
}

export interface ApprovalGroup { count: number; items: { id: number; title: string; subtitle: string; date: string }[]; link: string; }
export interface ApprovalsData {
  leave: ApprovalGroup; permission: ApprovalGroup; discount: ApprovalGroup; purchase: ApprovalGroup; manpower: ApprovalGroup; appraisal: ApprovalGroup;
}

export interface TelecallingData {
  total: number; answered: number; missed: number; answer_rate: number; avg_talk_seconds: number; talk_seconds: number;
  agents: Record<string, number>;
  leaderboard: { name: string; calls: number; answered: number; talk_seconds: number; appointments: number }[];
  trend: { label: string; a: number; b: number }[];
}

export interface MyDayData {
  queue: { assigned: number; never_contacted: number; follow_ups_today: number; follow_ups_overdue: number };
  calls_today: { total: number; answered: number; talk_seconds: number };
  calls_period: { total: number; answered: number };
  appointments_booked: number; appointments_today: number; conversions: number; conversion_rate: number;
  agent_status: string;
  follow_ups: { id: number; name: string; mobile: string; status: string | null; due: string; overdue: boolean; last_call: string | null }[];
}

export interface DoctorDayData {
  consultations_today: { id: number; name: string; status: string; time: string | null; category: string | null; treatment: string | null; step: number }[];
  waiting: number;
  sittings_today: { id: number; customer: string; treatment: string; sitting: string; status: string; time: string | null }[];
  pending_notes: number; completed: number; scheduled: number; upcoming_week: number; consultations_period: number;
}

export interface FrontDeskData {
  today: VisitRow[]; appointments_today: number; walk_ins_today: number; checked_in: number;
  awaiting_terms: number; invoiced_not_converted: number; sittings_today: number; sittings_done_today: number;
  pending_payments: { count: number; amount: number; items: { id: number; customer: string; mobile: string; treatment: string; due: number }[] };
}

export interface MyWorkData {
  has_employee: boolean;
  employee?: { name: string; emp_code: string; designation: string; department: string; join_date: string; status: string };
  tasks?: {
    total: number; by_status: Record<string, number>; completion: number; overdue: number;
    open: { id: number; title: string; type: string; status: string; due: string | null; metric: string | null; overdue: boolean }[];
  };
  attendance?: {
    today: { status: string; check_in: string | null; check_out: string | null; break_minutes: number } | null;
    month: Record<string, number>; present_days: number; late_days: number; hours: number;
  };
  leave?: {
    balance: { type: string; quota: number; used: number; left: number }[];
    pending: number;
    recent: { request_no: string; kind: string; leave_type: string | null; from_date: string; to_date: string; days: number; status: string }[];
  };
  payslip?: { id: number; month: string; gross: number; deductions: number; net: number; status: string; paid_days: number; working_days: number } | null;
  appraisal?: { cycle: string; rating: number; kpi_score: number; increment_percent: number; status: string; effective_from: string } | null;
}

export interface CustomerDashData {
  name: string; customer_code: string;
  plans: { id: number; treatment: string; status: string; start_date: string; end_date: string | null; sittings: number; completed: number; net: number; paid: number; balance: number }[];
  totals: { net: number; paid: number; balance: number; sittings: number; completed: number };
  upcoming: { id: number; treatment: string; sitting_no: number; date: string; time: string | null; doctor: string | null }[];
  payments: { id: number; amount: number; mode: string; date: string; remarks: string | null }[];
  documents: { id: number; title: string; type: string; document_date: string | null }[];
}

export interface DashResponse<T> { success: boolean; data: T; period?: DashPeriod; message?: string; }

/** "1h 05m" / "4m 12s" for call durations given in seconds. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Status text -> the theme's status tone (green / orange / red / blue / purple / gray). */
export function statusTone(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (['converted', 'completed', 'approved', 'present', 'paid', 'active', 'achieved', 'available', 'online'].some(k => s.includes(k))) return 'green';
  if (['cancel', 'reject', 'missed', 'expired', 'overdue', 'absent', 'blocked', 'offline'].some(k => s.includes(k))) return 'red';
  if (['pending', 'awaiting', 'late', 'draft', 'not started', 'busy', 'on call', 'break'].some(k => s.includes(k))) return 'orange';
  if (['consultation', 'progress', 'scheduled', 'invoiced'].some(k => s.includes(k))) return 'blue';
  return 'gray';
}
