export type CustomerStatus = 'Active' | 'Inactive';
export type CustomerSegment = 'Regular' | 'New';

/** One row of GET /customers - every figure is computed by the API from appointments, sittings, plans and payments. */
export interface Customer {
  id: number;
  customer_code: string;
  name: string;
  mobile_no: string;
  email: string | null;
  gender: string | null;
  branch_id: number | null;
  branch_name: string | null;
  /** "New" up to 2 visits, "Regular" from the 3rd. */
  segment: CustomerSegment;
  status: CustomerStatus;
  member_since: string | null;
  /** Consultation appointments + completed treatment sittings. */
  visits: number;
  last_visit: string | null;
  /** Net amount of the customer's treatment plans. */
  total_amount: number;
  /** Total amount minus the payments received. */
  balance_amount: number;
  preferred_service: string | null;
  /** Opens the customer details view (built from the latest appointment). */
  latest_appointment_id: number | null;
}

/** GET /customers/stats - the stat cards and the Branch / Preferred service filter options. */
export interface CustomerStats {
  total: number;
  active: number;
  new_this_month: number;
  avg_total_amount: number;
  branches: { id: number; name: string }[];
  services: { id: number; name: string }[];
}
