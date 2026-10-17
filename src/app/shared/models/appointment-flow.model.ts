/** Appointment wizard (consultation form) -> invoice -> customer, as returned by /appointment-flow. */

export type FlowStatus = 'Scheduled' | 'In Consultation' | 'Awaiting Terms' | 'Invoiced' | 'Converted' | 'Cancelled';
export type FlowCategory = 'Hair' | 'Skin';
export type PaymentMode = 'UPI' | 'Cash' | 'EMI' | 'Online';

export interface FlowDocument {
  id: number;
  title: string;
  url: string;
  mime: string | null;
  size: number;
}

export interface SittingPhoto {
  id: number;
  type: 'before' | 'after';
  url: string;
  captured_at: string | null;
}

export interface Sitting {
  id: number;
  sitting_no: number;
  scheduled_date: string | null;
  scheduled_time: string | null;
  actual_date: string | null;
  status: 'scheduled' | 'completed';
  notes: string | null;
  doctor?: { id: number; name: string } | null;
  photos: SittingPhoto[];
  requirements?: SittingRequirements;
}

/** What a sitting still needs before it can be completed (computed by the API). */
export interface SittingRequirements {
  /** Sitting no. that must be completed first; null when this sitting can be worked on. */
  waiting_for: number | null;
  has_before_photos: boolean;
  has_after_photos: boolean;
  has_notes: boolean;
  required_paid: number;
  paid: number;
  amount_due: number;
  balance: number;
  materials: { product_id: number; name: string; needed: number; available: number }[];
}

export interface FlowCustomer {
  id: number;
  customer_code: string;
  first_name: string;
  last_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  mobile_no?: string | null;
  alternate_mobile_no?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  occupation?: string | null;
  referred_by?: string | null;
  created_at?: string | null;
}

export interface FlowPayment {
  id: number;
  payment_mode: string;
  paid_amount: string;
  transaction_no: string | null;
  payment_date: string | null;
  remarks: string | null;
}

export interface FlowAppointmentRecord {
  id: number;
  lead_id: number | null;
  status: FlowStatus;
  current_step: number;
  name: string;
  mobile_no: string;
  email: string | null;
  gender: string | null;
  age: number | null;
  /** Service category name picked in the consultation form (Hair, Skin, Combo, Slimming ...). */
  category: string | null;
  heard_from: string | null;
  appointment_date: string;
  appointment_time: string;
  photo_url?: string | null;
  bp: string | null;
  weight: string | null;
  is_allergy: boolean;
  consultation: Record<string, any> | null;
  treatment_id: number | null;
  treatment?: { id: number; name: string; total_amount?: string; default_sittings?: number } | null;
  sittings_count: number;
  sitting_interval_days: number;
  price_per_sitting: string;
  total_amount: string;
  doctor_suggestion: string | null;
  payment_mode: PaymentMode | null;
  paid_amount: string;
  /** Paid / Partial / Pending, worked out by the API from paid_amount against total_amount. */
  payment_status: 'Paid' | 'Partial' | 'Pending';
  transaction_no: string | null;
  emi_months: number | null;
  terms_sent_at: string | null;
  terms_accepted_at: string | null;
  terms_accepted_via: string | null;
  terms_url?: string | null;
  invoice_no: string | null;
  invoiced_at: string | null;
  branch?: { id: number; name: string } | null;
  branch_type?: 'branch' | 'franchise' | null;
  /** Branch / franchise display name (a franchise reads "Name (Franchise)"). */
  branch_name?: string | null;
  counselor?: { id: number; name: string } | null;
  location?: string | null;
  pincode?: string | null;
  notes?: string | null;
  customer?: FlowCustomer | null;
  payments?: FlowPayment[];
  customer_treatment?: { id: number; sittings_count: number; completed_sittings: number; sittings: Sitting[]; treatment?: { id: number; name: string } | null } | null;
  /** Every treatment of the customer, newest first (earlier ones are view only). */
  treatment_history?: TreatmentHistory[];
  documents?: FlowDocument[];
  lead?: { source?: { source_name: string } | null; service_category?: { name: string } | null } | null;
  sms_sent?: boolean;
}

/** One treatment plan of a customer with its sittings (summary, for history views). */
export interface TreatmentHistory {
  id: number;
  treatment: string | null;
  status: 'active' | 'completed';
  start_date: string | null;
  end_date: string | null;
  sittings_count: number;
  completed_sittings: number;
  net_amount: number;
  paid: number;
  price_per_sitting: number;
  sittings: { id: number; sitting_no: number; scheduled_date: string | null; scheduled_time: string | null; actual_date: string | null; status: string }[];
}

export const PAYMENT_MODES: { value: PaymentMode; label: string; icon: string }[] = [
  { value: 'UPI', label: 'UPI', icon: 'bi-qr-code' },
  { value: 'Cash', label: 'Cash', icon: 'bi-cash-stack' },
  { value: 'EMI', label: 'EMI', icon: 'bi-calendar2-range' },
  { value: 'Online', label: 'Internet Banking', icon: 'bi-bank' },
];

export const EMI_MONTHS = [3, 6, 9, 12];

export const HEARD_FROM = ['Hoarding / Pamphlet', 'YouTube', 'Internet', 'Referred by Doctor', 'Our Client', 'Other'];

// -------- Clinical examination (from the printed consultation form) --------

export const FAMILY_HISTORY = ['Negative', 'Androgenetic Alopecia', 'Other'];
export const HAIR_LOSS_PATTERN = ['Androgenetic', 'Diffused', 'Localized'];
/** Male pattern hair loss grades (Norwood scale). */
export const NORWOOD_GRADES = ['Norwood 2', 'Norwood 2A', 'Norwood 3', 'Norwood 3A', 'Norwood 3A Vertex', 'Norwood 4', 'Norwood 4A', 'Norwood 5', 'Norwood 5A', 'Norwood 6'];
/** Female pattern hair loss grades (Ludwig scale). */
export const LUDWIG_GRADES = ['Grade 1', 'Grade 2', 'Grade 3'];

export const SKIN_TYPES = ['Normal', 'Oily', 'Dry', 'Combination'];
export const SKIN_CONCERNS = [
  'Breakouts / Acne', 'Blackheads / Whiteheads', 'Uneven Skin Tone', 'Sun Damage', 'Excessive Oil / Shine', 'Wrinkles / Fine Lines',
  'Dull / Dry Skin', 'Rosacea', 'Broken Capillaries', 'Redness / Ruddiness', 'Dehydrated', 'Sun, Liver, Brown Spots',
];
export const ALLERGIES = ['Cosmetics', 'Medicine', 'Food', 'Sun Damage', 'Sun Screen', 'Drugs', 'Iodine', 'Pollen', 'AHAs', 'Fragrance', 'Shellfish', 'Latex'];

export function inr(value: number | string | null | undefined): string {
  return `₹${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
