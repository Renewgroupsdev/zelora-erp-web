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
  category: FlowCategory | null;
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
  transaction_no: string | null;
  emi_months: number | null;
  terms_sent_at: string | null;
  terms_accepted_at: string | null;
  terms_accepted_via: string | null;
  terms_url?: string | null;
  invoice_no: string | null;
  invoiced_at: string | null;
  branch?: { id: number; name: string } | null;
  counselor?: { id: number; name: string } | null;
  customer?: { id: number; customer_code: string; first_name: string } | null;
  customer_treatment?: { id: number; sittings_count: number; completed_sittings: number; sittings: Sitting[] } | null;
  documents?: FlowDocument[];
  lead?: { source?: { source_name: string } | null; service_category?: { name: string } | null } | null;
  sms_sent?: boolean;
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
