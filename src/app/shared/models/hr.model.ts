/**
 * HR Management - the full in-and-out flow:
 * manpower request (vacancy + budget) -> job posted to portals -> candidates -> hire -> onboarding ->
 * employee (attendance, leave/permission, payroll + payslips, appraisals + bonus) -> exit + F&F settlement.
 */

export type EmployeeStatus = 'Onboarding' | 'Active' | 'On Notice' | 'Exited';
export type Gender = 'Male' | 'Female' | 'Other';

export const DEPARTMENTS = ['Clinical', 'Front Office', 'Tele Calling', 'Sales', 'Accounts', 'HR', 'Operations', 'SEO'];

export interface SalaryStructure {
  /** Monthly amounts. */
  basic: number;
  hra: number;
  conveyance: number;
  special: number;
  /** Employee PF % of basic (12% statutory). */
  pfPercent: number;
  /** ESI applies when gross <= 21,000 (0.75% employee share). */
  esiApplicable: boolean;
  professionalTax: number;
}

export interface Employee {
  id: string;
  empCode: string;
  name: string;
  gender: Gender;
  dob: string | null;
  phone: string;
  email: string;
  address: string;
  bloodGroup: string;
  designation: string;
  department: string;
  branch: string;
  reportingTo: string;
  joinDate: string;
  employmentType: 'Full Time' | 'Part Time' | 'Contract' | 'Intern';
  pan: string;
  aadhaarLast4: string;
  uan: string;
  bankName: string;
  accountNo: string;
  ifsc: string;
  emergencyContact: string;
  /** Alternate contact number (10-digit mobile). */
  secondaryPhone?: string;
  referralSource?: ReferralSource | '';
  /** Who referred this employee (name) and how to reach them. */
  referredBy?: string;
  referralPhone?: string;
  kycDocuments?: KycDocument[];
  salary: SalaryStructure;
  status: EmployeeStatus;
}

export type ReferralSource = 'Employee' | 'Agency' | 'Job Portal' | 'Walk-in' | 'Social Media' | 'Other';
export const REFERRAL_SOURCES: ReferralSource[] = ['Employee', 'Agency', 'Job Portal', 'Walk-in', 'Social Media', 'Other'];

export type KycDocType = 'Aadhaar' | 'PAN' | 'Passport' | 'Driving Licence' | 'Voter ID' | 'Address Proof' | 'Education Certificate' | 'Experience Letter' | 'Other';
export const KYC_DOC_TYPES: KycDocType[] = ['Aadhaar', 'PAN', 'Passport', 'Driving Licence', 'Voter ID', 'Address Proof', 'Education Certificate', 'Experience Letter', 'Other'];
/** Design stage keeps files in browser storage, so each is capped; the API will store them server side. */
export const KYC_MAX_BYTES = 1024 * 1024;
export const KYC_ACCEPT = '.pdf,.jpg,.jpeg,.png';

export interface KycDocument {
  id: string;
  type: KycDocType;
  /** Document number (optional). */
  number: string;
  fileName: string;
  mime: string;
  size: number;
  dataUrl: string;
  uploadedAt: string;
}

export type AttendanceStatus = 'Present' | 'Late' | 'Half Day' | 'Absent' | 'On Leave' | 'Permission' | 'Holiday';

export type BreakType = 'Morning Break' | 'Lunch' | 'Evening Break';
export const BREAK_TYPES: BreakType[] = ['Morning Break', 'Lunch', 'Evening Break'];

export interface AttendanceBreak {
  type: BreakType;
  start: string;
  /** null while the break is still running. */
  end: string | null;
}

export interface AttendanceRecord {
  id: string;
  empId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  source: 'Biometric' | 'Web' | 'Manual';
  remarks?: string;
  breaks?: AttendanceBreak[];
}

export type LeaveType = 'Casual Leave' | 'Sick Leave' | 'Earned Leave' | 'Comp Off' | 'Loss of Pay';
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected';

/** Yearly entitlement per leave type (Loss of Pay is unlimited). */
export const LEAVE_QUOTA: Record<LeaveType, number> = {
  'Casual Leave': 12,
  'Sick Leave': 8,
  'Earned Leave': 15,
  'Comp Off': 4,
  'Loss of Pay': 0,
};

export interface LeaveRequest {
  id: string;
  requestNo: string;
  empId: string;
  kind: 'Leave' | 'Permission';
  leaveType: LeaveType | null;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  /** Permission only - HH:mm. */
  fromTime: string | null;
  toTime: string | null;
  reason: string;
  appliedAt: string;
  status: RequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewRemarks?: string;
}

export type JobPortal = 'Indeed' | 'LinkedIn' | 'Naukri';
export const JOB_PORTALS: JobPortal[] = ['Indeed', 'LinkedIn', 'Naukri'];

export type ManpowerStatus = 'Pending' | 'Approved' | 'Rejected';
export type VacancyStatus = 'Open' | 'On Hold' | 'Filled' | 'Closed';

export interface ManpowerRequest {
  id: string;
  requestNo: string;
  branch: string;
  department: string;
  designation: string;
  positions: number;
  employmentType: Employee['employmentType'];
  experience: string;
  /** Monthly CTC range per position. */
  budgetMin: number;
  budgetMax: number;
  skills: string;
  justification: string;
  replacementFor: string;
  requiredBy: string | null;
  requestedBy: string;
  requestedAt: string;
  status: ManpowerStatus;
  reviewedBy?: string;
  reviewRemarks?: string;
  /** Set once approved - the request becomes a vacancy. */
  vacancyStatus?: VacancyStatus;
  postedTo: JobPortal[];
  hired: number;
}

/**
 * Hiring pipeline: Applied -> Shortlisted -> Interview (scheduled) -> Interviewed -> Selected ->
 * Verification (documents + background check) -> Offered (offer letter released) -> Hired (accepted).
 * A candidate can be Rejected at any step, or Offer Declined after the offer.
 */
export type CandidateStage = 'Applied' | 'Shortlisted' | 'Interview' | 'Interviewed' | 'Selected' | 'Verification' | 'Offered' | 'Hired' | 'Offer Declined' | 'Rejected';
export const CANDIDATE_STAGES: CandidateStage[] = ['Applied', 'Shortlisted', 'Interview', 'Interviewed', 'Selected', 'Verification', 'Offered', 'Hired', 'Offer Declined', 'Rejected'];

export type InterviewMode = 'In-person' | 'Video call' | 'Phone';
export const INTERVIEW_MODES: InterviewMode[] = ['In-person', 'Video call', 'Phone'];

/** Certificates / proofs HR collects from a selected candidate. `required` ones must be verified before an offer. */
export const VERIFICATION_DOCUMENTS: { type: string; required: boolean }[] = [
  { type: 'Photo ID (Aadhaar / Passport)', required: true },
  { type: 'PAN Card', required: true },
  { type: 'Address Proof', required: true },
  { type: 'Education Certificates', required: true },
  { type: 'Experience / Relieving Letter', required: false },
  { type: 'Last 3 Payslips', required: false },
  { type: 'Professional License / Registration', required: false },
];

export type DocumentStatus = 'Uploaded' | 'Verified' | 'Rejected';

export interface CandidateDocument {
  type: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  status: DocumentStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  remarks?: string;
}

export type BackgroundCheckStatus = 'Pending' | 'Clear' | 'Issue Found';

export interface CandidateInterview {
  scheduledAt: string;
  interviewer: string;
  mode: InterviewMode;
  scheduledBy: string;
  /** Set once the interview has taken place. */
  interviewedAt?: string;
  /** 1-5 performance in the interview. */
  performanceRating?: number;
  interviewNotes?: string;
}

export interface CandidateReview {
  reviewedBy: string;
  reviewedAt: string;
  rating: number;
  comments: string;
  decision: 'Selected' | 'Rejected';
}

export interface CandidateVerification {
  startedAt: string;
  startedBy: string;
  documents: CandidateDocument[];
  backgroundCheck: BackgroundCheckStatus;
  backgroundRemarks?: string;
  /** HR sign-off once every required document is verified and the background check is clear. */
  completedAt?: string;
  completedBy?: string;
}

export type OfferResponse = 'Pending' | 'Accepted' | 'Declined';

export interface CandidateOffer {
  offerNo: string;
  releasedAt: string;
  releasedBy: string;
  monthlyGross: number;
  joiningDate: string;
  validUntil: string;
  response: OfferResponse;
  respondedAt?: string;
  responseRemarks?: string;
}

/** Who did what to a candidate, newest last - answers "how was this person moved to this stage". */
export interface CandidateEvent {
  at: string;
  by: string;
  stage: CandidateStage;
  action: string;
  note?: string;
}

export interface Candidate {
  id: string;
  vacancyId: string;
  name: string;
  email: string;
  phone: string;
  source: JobPortal | 'Referral' | 'Walk-in';
  profileUrl: string;
  location: string;
  experienceYears: number;
  currentCompany: string;
  currentCtc: number;
  expectedCtc: number;
  noticeDays: number;
  skills: string;
  education: string;
  appliedAt: string;
  stage: CandidateStage;
  rating: number;
  interviewAt?: string | null;
  notes?: string;
  resumeFile: string;
  shortlistedBy?: string;
  shortlistedAt?: string;
  interview?: CandidateInterview;
  review?: CandidateReview;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  /** Stage the candidate was in when rejected. */
  rejectedAtStage?: CandidateStage;
  verification?: CandidateVerification;
  offer?: CandidateOffer;
  history?: CandidateEvent[];
}

export interface Payslip {
  id: string;
  month: string;
  empId: string;
  workingDays: number;
  paidDays: number;
  lopDays: number;
  earnings: { basic: number; hra: number; conveyance: number; special: number; bonus: number };
  deductions: { pf: number; esi: number; professionalTax: number; lop: number; advance: number };
  gross: number;
  totalDeductions: number;
  net: number;
  status: 'Processed' | 'Paid';
  paidAt?: string;
}

export type BonusType = 'Performance' | 'Festival' | 'Retention' | 'Referral' | 'Joining';

export interface Appraisal {
  id: string;
  empId: string;
  cycle: string;
  /** 1-5 */
  rating: number;
  kpiScore: number;
  strengths: string;
  improvements: string;
  reviewer: string;
  incrementPercent: number;
  oldMonthlyGross: number;
  newMonthlyGross: number;
  effectiveFrom: string;
  status: 'Draft' | 'Approved' | 'Released';
  createdAt: string;
}

export interface BonusRecord {
  id: string;
  empId: string;
  type: BonusType;
  amount: number;
  /** Paid with this month's payroll. */
  payMonth: string;
  reason: string;
  status: 'Approved' | 'Paid';
  appraisalId?: string;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface Onboarding {
  id: string;
  empId: string;
  candidateId?: string;
  joinDate: string;
  buddy: string;
  checklist: ChecklistItem[];
  status: 'In Progress' | 'Completed';
}

export interface ExitCase {
  id: string;
  empId: string;
  exitType: 'Resignation' | 'Termination' | 'Retirement' | 'Absconding';
  resignationDate: string;
  lastWorkingDay: string;
  reason: string;
  checklist: ChecklistItem[];
  /** Full & final settlement. */
  fnf: { pendingSalary: number; leaveEncashment: number; bonus: number; gratuity: number; recoveries: number };
  status: 'Notice Period' | 'Clearance' | 'Settled';
  settledAt?: string;
}

export const ONBOARDING_CHECKLIST = [
  'Offer letter signed',
  'ID proof & address proof collected',
  'PAN / Aadhaar / bank details verified',
  'Employee ID & biometric enrolled',
  'Email / ERP login created',
  'Uniform & ID card issued',
  'Induction & policy walkthrough',
  'Reporting manager introduction',
];

export const EXIT_CHECKLIST = [
  'Resignation accepted',
  'Knowledge transfer completed',
  'Assets returned (ID card, uniform, devices)',
  'ERP / email access revoked',
  'No-dues from accounts',
  'Exit interview done',
  'Relieving & experience letter issued',
];

export interface SalaryBreakup {
  gross: number;
  pf: number;
  esi: number;
  professionalTax: number;
  totalDeductions: number;
  net: number;
  annualCtc: number;
}

export function salaryBreakup(s: SalaryStructure): SalaryBreakup {
  const gross = s.basic + s.hra + s.conveyance + s.special;
  const pf = Math.round((s.basic * s.pfPercent) / 100);
  const esi = s.esiApplicable && gross <= 21000 ? Math.round(gross * 0.0075) : 0;
  const totalDeductions = pf + esi + s.professionalTax;
  // Employer PF (12% of basic) + employer ESI (3.25%) sit on top of gross in CTC.
  const employer = Math.round(s.basic * 0.12) + (s.esiApplicable && gross <= 21000 ? Math.round(gross * 0.0325) : 0);
  return { gross, pf, esi, professionalTax: s.professionalTax, totalDeductions, net: gross - totalDeductions, annualCtc: (gross + employer) * 12 };
}

/** Splits a monthly gross into the standard structure (basic 50%, HRA 20%, conveyance 1,600, rest special). */
export function structureFromGross(gross: number, base?: Partial<SalaryStructure>): SalaryStructure {
  const basic = Math.round(gross * 0.5);
  const hra = Math.round(gross * 0.2);
  const conveyance = Math.min(1600, Math.max(0, gross - basic - hra));
  return {
    basic,
    hra,
    conveyance,
    special: Math.max(0, gross - basic - hra - conveyance),
    pfPercent: base?.pfPercent ?? 12,
    esiApplicable: gross <= 21000,
    professionalTax: base?.professionalTax ?? (gross > 21000 ? 208 : 0),
  };
}

/** Worked hours between check-in and check-out, 0 when either is missing. */
export function workedHours(r: Pick<AttendanceRecord, 'checkIn' | 'checkOut'>): number {
  if (!r.checkIn || !r.checkOut) return 0;
  return Math.max(0, (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 3600000);
}

/** Minutes spent on a break; a running break counts up to `now`. */
export function breakMinutes(b: AttendanceBreak, now = Date.now()): number {
  const end = b.end ? new Date(b.end).getTime() : now;
  return Math.max(0, Math.round((end - new Date(b.start).getTime()) / 60000));
}

export function minutesLabel(minutes: number): string {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function hoursLabel(hours: number): string {
  if (!hours) return '-';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Shift starts 09:30 with 15 minutes grace. */
export const SHIFT_START = { hour: 9, minute: 45 };
export const FULL_DAY_HOURS = 8;

/** KYC number as displayed: Aadhaar is masked to XXXX-XXXX-1234, everything else is shown as entered. */
export function kycNumberLabel(d: Pick<KycDocument, 'type' | 'number'>): string {
  if (d.type !== 'Aadhaar') return d.number;
  const digits = d.number.replace(/\D/g, '');
  return digits.length >= 4 ? `XXXX-XXXX-${digits.slice(-4)}` : d.number;
}
