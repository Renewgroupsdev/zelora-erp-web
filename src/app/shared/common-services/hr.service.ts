import { Injectable, computed, effect, inject, signal } from '@angular/core';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/auth/auth.service';
import { isTelecallerRole } from '../../core/auth/auth.model';
import {
  Appraisal,
  AttendanceBreak,
  AttendanceRecord,
  AttendanceStatus,
  BonusRecord,
  BreakType,
  BonusType,
  BackgroundCheckStatus,
  Candidate,
  CandidateDocument,
  CandidateEvent,
  CandidateOffer,
  CandidateReview,
  CandidateVerification,
  CandidateStage,
  DEPARTMENTS,
  Employee,
  EXIT_CHECKLIST,
  ExitCase,
  FULL_DAY_HOURS,
  InterviewMode,
  JobPortal,
  LEAVE_QUOTA,
  LeaveRequest,
  LeaveType,
  ManpowerRequest,
  ONBOARDING_CHECKLIST,
  Onboarding,
  Payslip,
  SHIFT_START,
  VERIFICATION_DOCUMENTS,
  salaryBreakup,
  structureFromGross,
  workedHours,
} from '../models/hr.model';
import { BRANCHES, addDays, daysInMonth, isoDate, loadState, monthKey, saveState, seqNo, uid } from '../utils/format.util';
import { NotificationService } from './notification.service';

const STORAGE_KEY = 'zelora_hr_store_v1';

interface HrState {
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  manpower: ManpowerRequest[];
  candidates: Candidate[];
  payslips: Payslip[];
  appraisals: Appraisal[];
  bonuses: BonusRecord[];
  onboarding: Onboarding[];
  exits: ExitCase[];
}

export type NewEmployeeInput = Omit<Employee, 'id' | 'empCode' | 'status'>;
export type NewLeaveInput = Omit<LeaveRequest, 'id' | 'requestNo' | 'appliedAt' | 'status'>;
export type NewManpowerInput = Omit<ManpowerRequest, 'id' | 'requestNo' | 'requestedBy' | 'requestedAt' | 'status' | 'postedTo' | 'hired'>;
export type NewAppraisalInput = Omit<Appraisal, 'id' | 'status' | 'createdAt' | 'oldMonthlyGross' | 'newMonthlyGross'> & {
  bonus: { type: BonusType; amount: number; payMonth: string } | null;
};

/**
 * Front-end store for HR Management (design stage - no API yet). State lives in signals and is
 * mirrored to localStorage; swap each mutator for an API call once the backend endpoints exist.
 */
@Injectable({ providedIn: 'root' })
export class HrService {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly state = signal<HrState>(loadState(STORAGE_KEY, seedState));

  readonly employees = computed(() => this.state().employees);
  readonly attendance = computed(() => this.state().attendance);
  readonly leaves = computed(() => this.state().leaves);
  readonly manpower = computed(() => this.state().manpower);
  readonly candidates = computed(() => this.state().candidates);
  readonly payslips = computed(() => this.state().payslips);
  readonly appraisals = computed(() => this.state().appraisals);
  readonly bonuses = computed(() => this.state().bonuses);
  readonly onboarding = computed(() => this.state().onboarding);
  readonly exits = computed(() => this.state().exits);

  readonly branches = BRANCHES;
  readonly activeEmployees = computed(() => this.employees().filter(e => e.status !== 'Exited'));
  readonly vacancies = computed(() => this.manpower().filter(m => m.status === 'Approved'));
  readonly pendingLeaves = computed(() => this.leaves().filter(l => l.status === 'Pending').length);
  readonly pendingManpower = computed(() => this.manpower().filter(m => m.status === 'Pending').length);
  /** HR / branch heads / admins approve; other staff only raise requests. */
  readonly canApprove = computed(() => !isTelecallerRole(this.auth.currentUser()));

  constructor() {
    effect(() => saveState(STORAGE_KEY, this.state()));
  }

  get userName(): string {
    return this.auth.currentUser()?.name || 'HR Manager';
  }

  employee(id: string): Employee | undefined {
    return this.employees().find(e => e.id === id);
  }

  employeeName(id: string): string {
    return this.employee(id)?.name ?? 'Unknown';
  }

  // ---- Employees ----
  addEmployee(input: NewEmployeeInput, candidateId?: string): Employee {
    const employee: Employee = { ...input, id: uid('EMP'), empCode: this.nextEmpCode(), status: 'Onboarding' };
    const onboarding: Onboarding = {
      id: uid('ONB'),
      empId: employee.id,
      candidateId,
      joinDate: employee.joinDate,
      buddy: employee.reportingTo,
      checklist: ONBOARDING_CHECKLIST.map(label => ({ label, done: label === 'Offer letter signed' && !!candidateId })),
      status: 'In Progress',
    };
    this.patch({ employees: [employee, ...this.employees()], onboarding: [onboarding, ...this.onboarding()] });
    this.alert('New employee onboarding', `${employee.name} (${employee.empCode}) joins ${employee.branch} on ${employee.joinDate}.`, '/app/hr/onboarding-exit');
    return employee;
  }

  /**
   * The employee record behind a login (matched by email, then name). Logins without one get an Active
   * record created from their account so they can punch attendance; HR completes the rest in Employees.
   */
  ensureEmployeeForLogin(user: { name: string; email?: string; phone_no?: string | null; role?: { name: string } | null }): Employee {
    const email = user.email?.trim().toLowerCase();
    const name = user.name.trim().toLowerCase();
    const live = this.employees().filter(e => e.status !== 'Exited');
    const found = live.find(e => !!email && e.email.trim().toLowerCase() === email) ?? live.find(e => e.name.trim().toLowerCase() === name);
    if (found) return found;

    const employee: Employee = {
      id: uid('EMP'), empCode: this.nextEmpCode(), status: 'Active',
      name: user.name.trim(), gender: 'Other', dob: null, phone: user.phone_no ?? '', email: user.email ?? '', address: '', bloodGroup: '',
      designation: user.role?.name ?? 'Staff', department: DEPARTMENTS[0], branch: this.branches[0], reportingTo: 'Branch Head',
      joinDate: isoDate(), employmentType: 'Full Time', pan: '', aadhaarLast4: '', uan: '', bankName: '', accountNo: '', ifsc: '',
      emergencyContact: '', salary: structureFromGross(0),
    };
    this.patch({ employees: [employee, ...this.employees()] });
    this.notifications.add({ type: 'hr', title: 'Employee record created', message: `${employee.name} (${employee.empCode}) was added from their login. Complete the details in Employees.`, link: '/app/hr/employees' });
    return employee;
  }

  updateEmployee(id: string, patch: Partial<Employee>): void {
    this.patch({ employees: this.employees().map(e => (e.id === id ? { ...e, ...patch } : e)) });
  }

  private nextEmpCode(): string {
    const max = this.employees().reduce((m, e) => Math.max(m, Number(e.empCode.replace(/\D/g, '')) || 0), 1000);
    return `RP${max + 1}`;
  }

  // ---- Attendance ----
  todayRecord(empId: string): AttendanceRecord | undefined {
    const today = isoDate();
    return this.attendance().find(a => a.empId === empId && a.date === today);
  }

  checkIn(empId: string): AttendanceRecord {
    const existing = this.todayRecord(empId);
    if (existing?.checkIn) return existing;
    const now = new Date();
    const late = now.getHours() > SHIFT_START.hour || (now.getHours() === SHIFT_START.hour && now.getMinutes() > SHIFT_START.minute);
    const record: AttendanceRecord = {
      id: existing?.id ?? uid('ATT'),
      empId,
      date: isoDate(now),
      checkIn: now.toISOString(),
      checkOut: null,
      status: late ? 'Late' : 'Present',
      source: 'Web',
    };
    this.patch({ attendance: [record, ...this.attendance().filter(a => a.id !== record.id)] });
    return record;
  }

  checkOut(empId: string): AttendanceRecord | null {
    const existing = this.todayRecord(empId);
    if (!existing?.checkIn || existing.checkOut) return null;
    const now = new Date().toISOString();
    // Checking out closes any break still running.
    const updated: AttendanceRecord = { ...existing, checkOut: now, breaks: existing.breaks?.map(b => (b.end ? b : { ...b, end: now })) };
    if (workedHours(updated) < FULL_DAY_HOURS / 2) updated.status = 'Half Day';
    this.patch({ attendance: this.attendance().map(a => (a.id === existing.id ? updated : a)) });
    return updated;
  }

  /** Starts a break (morning / lunch / evening) on today's open attendance. Null if not checked in, already out or a break is running. */
  startBreak(empId: string, type: BreakType): AttendanceRecord | null {
    const existing = this.todayRecord(empId);
    const breaks = existing?.breaks ?? [];
    if (!existing?.checkIn || existing.checkOut || breaks.some(b => !b.end || b.type === type)) return null;
    const updated: AttendanceRecord = { ...existing, breaks: [...breaks, { type, start: new Date().toISOString(), end: null }] };
    this.patch({ attendance: this.attendance().map(a => (a.id === existing.id ? updated : a)) });
    return updated;
  }

  endBreak(empId: string): AttendanceRecord | null {
    const existing = this.todayRecord(empId);
    if (!existing?.breaks?.some(b => !b.end)) return null;
    const updated: AttendanceRecord = { ...existing, breaks: existing.breaks.map(b => (b.end ? b : { ...b, end: new Date().toISOString() })) };
    this.patch({ attendance: this.attendance().map(a => (a.id === existing.id ? updated : a)) });
    return updated;
  }

  /** HR correction of a day (missed punch, regularisation). */
  markAttendance(empId: string, date: string, status: AttendanceStatus, checkIn: string | null, checkOut: string | null, remarks: string): void {
    const existing = this.attendance().find(a => a.empId === empId && a.date === date);
    const record: AttendanceRecord = { id: existing?.id ?? uid('ATT'), empId, date, status, checkIn, checkOut, source: 'Manual', remarks };
    this.patch({ attendance: [record, ...this.attendance().filter(a => a.id !== record.id)] });
  }

  // ---- Leave & permission ----
  applyLeave(input: NewLeaveInput): LeaveRequest {
    const request: LeaveRequest = { ...input, id: uid('LV'), requestNo: seqNo(input.kind === 'Leave' ? 'LV' : 'PM', this.leaves().length), appliedAt: new Date().toISOString(), status: 'Pending' };
    this.patch({ leaves: [request, ...this.leaves()] });
    this.alert(`${input.kind} request`, `${this.employeeName(input.empId)} applied for ${input.kind === 'Leave' ? input.leaveType : 'permission'} - waiting for HR approval.`, '/app/hr/leave-permission');
    return request;
  }

  reviewLeave(id: string, approve: boolean, remarks: string): void {
    const request = this.leaves().find(l => l.id === id);
    if (!request || request.status !== 'Pending') return;

    let attendance = this.attendance();
    if (approve) {
      // Approved leave / permission shows up on the attendance register.
      const status: AttendanceStatus = request.kind === 'Permission' ? 'Permission' : 'On Leave';
      for (let d = request.fromDate; d <= request.toDate; d = addDays(d, 1)) {
        if (new Date(`${d}T00:00:00`).getDay() === 0) continue;
        const existing = attendance.find(a => a.empId === request.empId && a.date === d);
        if (existing && request.kind === 'Permission') {
          attendance = attendance.map(a => (a.id === existing.id ? { ...a, remarks: `Permission ${request.fromTime}-${request.toTime}` } : a));
          continue;
        }
        attendance = [
          { id: existing?.id ?? uid('ATT'), empId: request.empId, date: d, checkIn: existing?.checkIn ?? null, checkOut: existing?.checkOut ?? null, status: request.halfDay ? 'Half Day' : status, source: 'Manual', remarks: request.leaveType ?? 'Permission' },
          ...attendance.filter(a => a.id !== existing?.id),
        ];
      }
    }

    this.patch({
      attendance,
      leaves: this.leaves().map(l => l.id === id
        ? { ...l, status: approve ? 'Approved' : 'Rejected', reviewedBy: this.userName, reviewedAt: new Date().toISOString(), reviewRemarks: remarks }
        : l),
    });
  }

  leaveDays(l: Pick<LeaveRequest, 'kind' | 'fromDate' | 'toDate' | 'halfDay'>): number {
    if (l.kind === 'Permission') return 0;
    if (l.halfDay) return 0.5;
    let days = 0;
    for (let d = l.fromDate; d <= l.toDate; d = addDays(d, 1)) if (new Date(`${d}T00:00:00`).getDay() !== 0) days++;
    return days;
  }

  leaveBalance(empId: string): { type: LeaveType; quota: number; used: number; balance: number }[] {
    const year = String(new Date().getFullYear());
    const used = (type: LeaveType) => this.leaves()
      .filter(l => l.empId === empId && l.kind === 'Leave' && l.leaveType === type && l.status === 'Approved' && l.fromDate.startsWith(year))
      .reduce((s, l) => s + this.leaveDays(l), 0);
    return (Object.keys(LEAVE_QUOTA) as LeaveType[]).map(type => {
      const u = used(type);
      return { type, quota: LEAVE_QUOTA[type], used: u, balance: Math.max(0, LEAVE_QUOTA[type] - u) };
    });
  }

  // ---- Manpower requests / vacancies ----
  createManpower(input: NewManpowerInput): ManpowerRequest {
    const request: ManpowerRequest = { ...input, id: uid('MR'), requestNo: seqNo('MR', this.manpower().length), requestedBy: this.userName, requestedAt: new Date().toISOString(), status: 'Pending', postedTo: [], hired: 0 };
    this.patch({ manpower: [request, ...this.manpower()] });
    this.alert('Manpower request', `${request.branch} needs ${request.positions} × ${request.designation} (budget ₹${request.budgetMin.toLocaleString('en-IN')}-${request.budgetMax.toLocaleString('en-IN')}/month).`, '/app/hr/recruitment');
    return request;
  }

  reviewManpower(id: string, approve: boolean, remarks: string): void {
    this.patch({
      manpower: this.manpower().map(m => m.id === id
        ? { ...m, status: approve ? 'Approved' : 'Rejected', reviewedBy: this.userName, reviewRemarks: remarks, vacancyStatus: approve ? 'Open' : undefined }
        : m),
    });
  }

  setVacancyStatus(id: string, vacancyStatus: ManpowerRequest['vacancyStatus']): void {
    this.patch({ manpower: this.manpower().map(m => (m.id === id ? { ...m, vacancyStatus } : m)) });
  }

  postToPortals(id: string, portals: JobPortal[]): void {
    this.patch({ manpower: this.manpower().map(m => (m.id === id ? { ...m, postedTo: [...new Set([...m.postedTo, ...portals])] } : m)) });
  }

  /**
   * Pulls new applicants for a vacancy from a job portal. Design stage: generates realistic sample
   * profiles - replace with the portal's employer API (Indeed Job Sync, LinkedIn Talent, Naukri RMS) via the backend.
   */
  syncApplicants(vacancyId: string, portal: JobPortal): Candidate[] {
    const vacancy = this.manpower().find(m => m.id === vacancyId);
    if (!vacancy) return [];
    const rand = mulberry32(Date.now() % 100000);
    const count = 2 + Math.floor(rand() * 3);
    const fresh = Array.from({ length: count }, () => makeCandidate(vacancy, portal, rand, 0));
    this.patch({ candidates: [...fresh, ...this.candidates()], manpower: this.manpower().map(m => (m.id === vacancyId && !m.postedTo.includes(portal) ? { ...m, postedTo: [...m.postedTo, portal] } : m)) });
    return fresh;
  }

  addCandidate(candidate: Omit<Candidate, 'id' | 'appliedAt' | 'stage' | 'resumeFile'>): Candidate {
    const c: Candidate = { ...candidate, id: uid('CND'), appliedAt: new Date().toISOString(), stage: 'Applied', resumeFile: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf` };
    this.patch({ candidates: [c, ...this.candidates()] });
    return c;
  }

  moveCandidate(id: string, stage: CandidateStage, patch: Partial<Candidate> = {}): void {
    this.patch({ candidates: this.candidates().map(c => (c.id === id ? { ...c, ...patch, stage } : c)) });
  }

  // ---- Candidate hiring workflow ----
  private updateCandidate(id: string, change: (c: Candidate) => Candidate): void {
    this.patch({ candidates: this.candidates().map(c => (c.id === id ? change(c) : c)) });
  }

  /** Moves a candidate to `stage`, applying `patch`, and records who did it on the candidate's history. */
  private advance(c: Candidate, stage: CandidateStage, action: string, patch: Partial<Candidate> = {}, note?: string): Candidate {
    const event: CandidateEvent = { at: new Date().toISOString(), by: this.userName, stage, action, ...(note ? { note } : {}) };
    return { ...c, ...patch, stage, history: [...(c.history ?? []), event] };
  }

  shortlistCandidate(id: string): void {
    this.updateCandidate(id, c => this.advance(c, 'Shortlisted', 'Shortlisted', { shortlistedBy: this.userName, shortlistedAt: new Date().toISOString() }));
  }

  scheduleInterview(id: string, input: { scheduledAt: string; interviewer: string; mode: InterviewMode }): void {
    this.updateCandidate(id, c => this.advance(c, 'Interview', c.interview ? 'Interview rescheduled' : 'Interview scheduled',
      { interviewAt: input.scheduledAt, interview: { ...input, scheduledBy: this.userName } },
      `${input.interviewer} · ${input.mode}`));
  }

  /** The interview took place: store the interviewer's performance rating and notes. */
  recordInterview(id: string, input: { interviewedAt: string; performanceRating: number; notes: string }): void {
    this.updateCandidate(id, c => {
      const interview = c.interview ?? { scheduledAt: c.interviewAt ?? input.interviewedAt, interviewer: this.userName, mode: 'In-person' as InterviewMode, scheduledBy: this.userName };
      return this.advance(c, 'Interviewed', 'Interview completed',
        { rating: input.performanceRating, interview: { ...interview, interviewedAt: input.interviewedAt, performanceRating: input.performanceRating, interviewNotes: input.notes } },
        `Performance ${input.performanceRating}/5`);
    });
  }

  /** Final review after the interview: Selected moves on to verification, Rejected closes the candidate. */
  reviewCandidate(id: string, input: { rating: number; comments: string; selected: boolean }): void {
    const decision = input.selected ? 'Selected' : 'Rejected';
    this.updateCandidate(id, c => {
      const review: CandidateReview = { reviewedBy: this.userName, reviewedAt: new Date().toISOString(), rating: input.rating, comments: input.comments, decision };
      return input.selected
        ? this.advance(c, 'Selected', 'Selected after interview', { review, rating: input.rating }, input.comments)
        : this.advance(c, 'Rejected', 'Rejected after interview', { review, rating: input.rating, rejectedBy: this.userName, rejectedAt: new Date().toISOString(), rejectionReason: input.comments, rejectedAtStage: c.stage }, input.comments);
    });
  }

  rejectCandidate(id: string, reason: string): void {
    this.updateCandidate(id, c => this.advance(c, 'Rejected', 'Rejected',
      { rejectedBy: this.userName, rejectedAt: new Date().toISOString(), rejectionReason: reason, rejectedAtStage: c.stage }, reason));
  }

  startVerification(id: string): void {
    this.updateCandidate(id, c => this.advance(c, 'Verification', 'Background verification started',
      { verification: { startedAt: new Date().toISOString(), startedBy: this.userName, documents: [], backgroundCheck: 'Pending' } }));
  }

  private withVerification(id: string, change: (v: CandidateVerification) => CandidateVerification, action: string, note?: string): void {
    this.updateCandidate(id, c => {
      if (!c.verification) return c;
      const event: CandidateEvent = { at: new Date().toISOString(), by: this.userName, stage: c.stage, action, ...(note ? { note } : {}) };
      return { ...c, verification: change(c.verification), history: [...(c.history ?? []), event] };
    });
  }

  /** Design stage: only the file name is kept - upload the file itself once the document API exists. */
  uploadCandidateDocument(id: string, type: string, fileName: string): void {
    const doc: CandidateDocument = { type, fileName, uploadedAt: new Date().toISOString(), uploadedBy: this.userName, status: 'Uploaded' };
    this.withVerification(id, v => ({ ...v, documents: [...v.documents.filter(d => d.type !== type), doc] }), `${type} uploaded`, fileName);
  }

  verifyCandidateDocument(id: string, type: string, verified: boolean, remarks: string): void {
    this.withVerification(id, v => ({
      ...v,
      documents: v.documents.map(d => (d.type === type
        ? { ...d, status: verified ? 'Verified' as const : 'Rejected' as const, verifiedBy: this.userName, verifiedAt: new Date().toISOString(), remarks }
        : d)),
    }), `${type} ${verified ? 'verified' : 'rejected'}`, remarks || undefined);
  }

  setBackgroundCheck(id: string, status: BackgroundCheckStatus, remarks: string): void {
    this.withVerification(id, v => ({ ...v, backgroundCheck: status, backgroundRemarks: remarks }), `Background check: ${status}`, remarks || undefined);
  }

  /** What still blocks the offer: missing / unverified required documents and the background check. */
  verificationGaps(c: Candidate): string[] {
    const v = c.verification;
    if (!v) return ['Verification has not started'];
    const gaps = VERIFICATION_DOCUMENTS.filter(d => d.required && v.documents.find(x => x.type === d.type)?.status !== 'Verified').map(d => `${d.type} not verified`);
    if (v.backgroundCheck !== 'Clear') gaps.push(`Background check is ${v.backgroundCheck.toLowerCase()}`);
    return gaps;
  }

  completeVerification(id: string): boolean {
    const c = this.candidates().find(x => x.id === id);
    if (!c || this.verificationGaps(c).length) return false;
    this.withVerification(id, v => ({ ...v, completedAt: new Date().toISOString(), completedBy: this.userName }), 'Verification completed by HR');
    return true;
  }

  /** Releases the offer letter. Needs completed verification. */
  releaseOffer(id: string, input: { monthlyGross: number; joiningDate: string; validUntil: string }): CandidateOffer | null {
    const c = this.candidates().find(x => x.id === id);
    if (!c || !c.verification?.completedAt) return null;
    const offer: CandidateOffer = {
      offerNo: seqNo('OFR', this.candidates().filter(x => x.offer).length),
      releasedAt: new Date().toISOString(),
      releasedBy: this.userName,
      response: 'Pending',
      ...input,
    };
    this.updateCandidate(id, x => this.advance(x, 'Offered', 'Offer letter released', { offer }, `${offer.offerNo} · ₹${input.monthlyGross.toLocaleString('en-IN')} / month`));
    this.notifications.add({ type: 'hr', title: 'Offer letter released', message: `${offer.offerNo} sent to ${c.name}.`, link: '/app/hr/recruitment' });
    return offer;
  }

  /** Candidate's answer to the offer: accepted -> hired and onboarding starts, declined -> Offer Declined. */
  respondToOffer(id: string, accepted: boolean, remarks: string): void {
    const c = this.candidates().find(x => x.id === id);
    if (!c?.offer) return;
    const offer: CandidateOffer = { ...c.offer, response: accepted ? 'Accepted' : 'Declined', respondedAt: new Date().toISOString(), responseRemarks: remarks };
    if (accepted) {
      // Accepting makes the candidate Hired and fills a position; the employee record is added next (createEmployeeFromCandidate).
      this.updateCandidate(id, x => this.advance(x, 'Hired', 'Offer accepted - hired', { offer }, remarks));
      const vacancy = this.manpower().find(m => m.id === c.vacancyId);
      if (vacancy) {
        const hired = vacancy.hired + 1;
        this.patch({ manpower: this.manpower().map(m => (m.id === vacancy.id ? { ...m, hired, vacancyStatus: hired >= m.positions ? 'Filled' : m.vacancyStatus } : m)) });
      }
    } else {
      this.updateCandidate(id, x => this.advance(x, 'Offer Declined', 'Offer declined', { offer }, remarks));
    }
    this.notifications.add({ type: 'hr', title: accepted ? 'Offer accepted' : 'Offer declined', message: `${c.name} ${accepted ? 'accepted' : 'declined'} ${offer.offerNo}.`, link: '/app/hr/recruitment' });
  }

  /** The employee created from this candidate, if any. */
  employeeForCandidate(candidateId: string): Employee | undefined {
    const link = this.onboarding().find(o => o.candidateId === candidateId);
    return link && this.employee(link.empId);
  }

  /** A hired candidate who has no employee record yet. */
  awaitingJoining(c: Candidate): boolean {
    return c.stage === 'Hired' && !this.onboarding().some(o => o.candidateId === c.id) && !!this.manpower().find(m => m.id === c.vacancyId);
  }

  /** Add Employee form defaults for an accepted candidate: profile from the application, job and pay from the vacancy and offer. */
  employeeDraftFor(candidateId: string): NewEmployeeInput | null {
    const c = this.candidates().find(x => x.id === candidateId);
    const vacancy = c && this.manpower().find(m => m.id === c.vacancyId);
    if (!c || !vacancy) return null;
    return {
      name: c.name, gender: 'Other', dob: null, phone: c.phone, email: c.email, address: c.location, bloodGroup: '',
      designation: vacancy.designation, department: vacancy.department, branch: vacancy.branch, reportingTo: 'Branch Head',
      joinDate: c.offer?.joiningDate ?? isoDate(), employmentType: vacancy.employmentType, pan: '', aadhaarLast4: '', uan: '', bankName: '', accountNo: '', ifsc: '',
      emergencyContact: '', salary: structureFromGross(c.offer?.monthlyGross ?? c.expectedCtc),
    };
  }

  /** Saves the employee from the Add Employee form for a hired candidate and starts onboarding. */
  createEmployeeFromCandidate(id: string, input: NewEmployeeInput): Employee | null {
    const c = this.candidates().find(x => x.id === id);
    if (!c || !this.awaitingJoining(c)) return null;
    this.updateCandidate(id, x => this.advance(x, 'Hired', 'Employee record created, onboarding started'));
    return this.addEmployee(input, c.id);
  }

  // ---- Payroll ----
  workingDays(month: string): number {
    let days = 0;
    for (let d = 1; d <= daysInMonth(month); d++) if (new Date(`${month}-${String(d).padStart(2, '0')}T00:00:00`).getDay() !== 0) days++;
    return days;
  }

  /** Builds payslips for every employee on payroll in the month. Already-paid slips are kept. */
  runPayroll(month: string): Payslip[] {
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    const paid = this.payslips().filter(p => p.month === month && p.status === 'Paid');
    const workingDays = this.workingDays(month);

    const slips = this.employees()
      .filter(e => e.joinDate <= monthEnd && e.status !== 'Exited' && !paid.some(p => p.empId === e.id))
      .map(e => {
        const absent = this.attendance().filter(a => a.empId === e.id && a.date.startsWith(month) && a.status === 'Absent').length;
        const halfDays = this.attendance().filter(a => a.empId === e.id && a.date.startsWith(month) && a.status === 'Half Day' && !a.remarks).length;
        const lopLeaves = this.leaves().filter(l => l.empId === e.id && l.status === 'Approved' && l.leaveType === 'Loss of Pay' && l.fromDate.startsWith(month)).reduce((s, l) => s + this.leaveDays(l), 0);
        const lopDays = Math.min(workingDays, absent + halfDays * 0.5 + lopLeaves);
        const bonus = this.bonuses().filter(b => b.empId === e.id && b.payMonth === month).reduce((s, b) => s + b.amount, 0);
        return buildPayslip(e, month, workingDays, lopDays, bonus);
      });

    this.patch({ payslips: [...slips, ...this.payslips().filter(p => p.month !== month || p.status === 'Paid')] });
    return slips;
  }

  markPaid(ids: string[]): void {
    const slips = this.payslips().filter(p => ids.includes(p.id));
    this.patch({
      payslips: this.payslips().map(p => (ids.includes(p.id) ? { ...p, status: 'Paid', paidAt: new Date().toISOString() } : p)),
      bonuses: this.bonuses().map(b => (slips.some(s => s.empId === b.empId && s.month === b.payMonth) ? { ...b, status: 'Paid' } : b)),
    });
  }

  // ---- Appraisals & bonus ----
  createAppraisal(input: NewAppraisalInput): Appraisal {
    const emp = this.employee(input.empId)!;
    const oldGross = salaryBreakup(emp.salary).gross;
    const { bonus, ...rest } = input;
    const appraisal: Appraisal = {
      ...rest,
      id: uid('APR'),
      oldMonthlyGross: oldGross,
      newMonthlyGross: Math.round(oldGross * (1 + input.incrementPercent / 100)),
      status: 'Draft',
      createdAt: new Date().toISOString(),
    };
    const bonuses = bonus?.amount
      ? [{ id: uid('BON'), empId: input.empId, type: bonus.type, amount: bonus.amount, payMonth: bonus.payMonth, reason: `${input.cycle} appraisal`, status: 'Approved' as const, appraisalId: appraisal.id }, ...this.bonuses()]
      : this.bonuses();
    this.patch({ appraisals: [appraisal, ...this.appraisals()], bonuses });
    return appraisal;
  }

  approveAppraisal(id: string): void {
    this.patch({ appraisals: this.appraisals().map(a => (a.id === id && a.status === 'Draft' ? { ...a, status: 'Approved' } : a)) });
  }

  /** Releases the letter and moves the employee to the revised salary. */
  releaseAppraisal(id: string): void {
    const a = this.appraisals().find(x => x.id === id);
    if (!a || a.status !== 'Approved') return;
    const emp = this.employee(a.empId);
    if (emp) this.updateEmployee(emp.id, { salary: structureFromGross(a.newMonthlyGross, emp.salary) });
    this.patch({ appraisals: this.appraisals().map(x => (x.id === id ? { ...x, status: 'Released' } : x)) });
    this.alert('Appraisal released', `${this.employeeName(a.empId)}: ${a.incrementPercent}% increment effective ${a.effectiveFrom}.`, '/app/hr/appraisals');
  }

  addBonus(input: Omit<BonusRecord, 'id' | 'status'>): void {
    this.patch({ bonuses: [{ ...input, id: uid('BON'), status: 'Approved' }, ...this.bonuses()] });
  }

  // ---- Onboarding (in) / exit (out) ----
  toggleOnboardingItem(id: string, index: number): void {
    const list = this.onboarding().map(o => {
      if (o.id !== id) return o;
      const checklist = o.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
      return { ...o, checklist, status: checklist.every(c => c.done) ? 'Completed' as const : 'In Progress' as const };
    });
    const done = list.find(o => o.id === id);
    this.patch({ onboarding: list });
    if (done?.status === 'Completed') this.updateEmployee(done.empId, { status: 'Active' });
  }

  startExit(input: Pick<ExitCase, 'empId' | 'exitType' | 'resignationDate' | 'lastWorkingDay' | 'reason'>): ExitCase {
    const emp = this.employee(input.empId)!;
    const gross = salaryBreakup(emp.salary).gross;
    const dayRate = gross / 26;
    const balance = this.leaveBalance(emp.id).find(b => b.type === 'Earned Leave')?.balance ?? 0;
    const years = (new Date(input.lastWorkingDay).getTime() - new Date(emp.joinDate).getTime()) / (365.25 * 86400000);
    const lastDay = Number(input.lastWorkingDay.slice(8, 10));

    const exit: ExitCase = {
      ...input,
      id: uid('EXT'),
      checklist: EXIT_CHECKLIST.map(label => ({ label, done: label === 'Resignation accepted' })),
      fnf: {
        pendingSalary: Math.round(dayRate * Math.min(26, lastDay)),
        leaveEncashment: Math.round((emp.salary.basic / 26) * balance),
        bonus: 0,
        // Gratuity after 5 years: 15 days' basic per completed year.
        gratuity: years >= 5 ? Math.round((emp.salary.basic * 15 * Math.floor(years)) / 26) : 0,
        recoveries: 0,
      },
      status: 'Notice Period',
    };
    this.patch({ exits: [exit, ...this.exits()] });
    this.updateEmployee(emp.id, { status: 'On Notice' });
    this.alert('Employee exit initiated', `${emp.name} - last working day ${input.lastWorkingDay}.`, '/app/hr/onboarding-exit');
    return exit;
  }

  toggleExitItem(id: string, index: number): void {
    this.patch({
      exits: this.exits().map(x => {
        if (x.id !== id) return x;
        const checklist = x.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
        return { ...x, checklist, status: x.status === 'Settled' ? x.status : checklist.every(c => c.done) ? 'Clearance' : 'Notice Period' };
      }),
    });
  }

  updateFnf(id: string, fnf: ExitCase['fnf']): void {
    this.patch({ exits: this.exits().map(x => (x.id === id ? { ...x, fnf } : x)) });
  }

  settleExit(id: string): void {
    const exit = this.exits().find(x => x.id === id);
    if (!exit) return;
    this.patch({ exits: this.exits().map(x => (x.id === id ? { ...x, status: 'Settled', settledAt: new Date().toISOString() } : x)) });
    this.updateEmployee(exit.empId, { status: 'Exited' });
  }

  fnfTotal(fnf: ExitCase['fnf']): number {
    return fnf.pendingSalary + fnf.leaveEncashment + fnf.bonus + fnf.gratuity - fnf.recoveries;
  }

  private alert(title: string, message: string, link: string): void {
    this.notifications.add({ type: 'hr', title, message, link });
    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title, text: message, showConfirmButton: false, timer: 4500, timerProgressBar: true });
  }

  private patch(partial: Partial<HrState>): void {
    this.state.update(s => ({ ...s, ...partial }));
  }
}

// ---------------------------------------------------------------------------
// Helpers + seed data
// ---------------------------------------------------------------------------

export function buildPayslip(e: Employee, month: string, workingDays: number, lopDays: number, bonus: number): Payslip {
  const s = e.salary;
  const b = salaryBreakup(s);
  const lop = Math.round((b.gross / workingDays) * lopDays);
  const earnings = { basic: s.basic, hra: s.hra, conveyance: s.conveyance, special: s.special, bonus };
  const deductions = { pf: b.pf, esi: b.esi, professionalTax: b.professionalTax, lop, advance: 0 };
  const gross = b.gross + bonus;
  const totalDeductions = deductions.pf + deductions.esi + deductions.professionalTax + lop;
  return {
    id: uid('PAY'), month, empId: e.id, workingDays, paidDays: workingDays - lopDays, lopDays,
    earnings, deductions, gross, totalDeductions, net: gross - totalDeductions, status: 'Processed',
  };
}

/** Small deterministic PRNG so the seed looks the same on every fresh load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Arun', 'Divya', 'Karthik', 'Meena', 'Rahul', 'Sneha', 'Vignesh', 'Pooja', 'Suresh', 'Lakshmi', 'Naveen', 'Kavya', 'Prakash', 'Revathi', 'Ajay', 'Nithya'];
const LAST = ['Kumar', 'Raman', 'Sharma', 'Iyer', 'Krishnan', 'Nair', 'Reddy', 'Pillai', 'Subramanian', 'Menon', 'Rao', 'Joseph'];
const COMPANIES = ['Kaya Clinic', 'VLCC', 'Apollo Cosmetic', 'Lakme Salon', 'Oliva Clinic', 'Naturals', 'Freelance', 'Dr. Batra\'s'];
const CITIES = ['Chennai', 'Coimbatore', 'Madurai', 'Bengaluru', 'Trichy'];

function makeCandidate(v: ManpowerRequest, source: Candidate['source'], rand: () => number, daysAgo: number): Candidate {
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const exp = Math.round(rand() * 8 * 10) / 10;
  const current = Math.round((v.budgetMin * (0.7 + rand() * 0.5)) / 500) * 500;
  const profileUrl = source === 'LinkedIn' ? `https://www.linkedin.com/in/${slug}` : source === 'Naukri' ? `https://www.naukri.com/profile/${slug}` : source === 'Indeed' ? `https://profile.indeed.com/p/${slug}` : '';
  return {
    id: uid('CND'),
    vacancyId: v.id,
    name,
    email: `${slug.replace('-', '.')}@gmail.com`,
    phone: `9${Math.floor(100000000 + rand() * 899999999)}`,
    source,
    profileUrl,
    location: pick(CITIES),
    experienceYears: exp,
    currentCompany: pick(COMPANIES),
    currentCtc: current,
    expectedCtc: Math.round((current * (1.1 + rand() * 0.25)) / 500) * 500,
    noticeDays: pick([0, 15, 30, 60]),
    skills: v.skills,
    education: pick(['B.Sc', 'Diploma', 'B.Com', 'MBA', 'BDS', 'B.Pharm']),
    appliedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    stage: 'Applied',
    rating: 0,
    resumeFile: `${name.replace(/\s+/g, '_')}_Resume.pdf`,
  };
}

function seedState(): HrState {
  const rand = mulberry32(42);
  const today = isoDate();
  const ago = (days: number) => addDays(today, -days);
  const at = (date: string, h: number, m: number) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();

  const people: [string, Employee['gender'], string, string, string, number, string][] = [
    ['Anitha Mohan', 'Female', 'Branch Head', 'Operations', 'Anna Nagar', 65000, '2019-04-10'],
    ['Dr. Priya Sharma', 'Female', 'Senior Dermatologist', 'Clinical', 'Velachery', 120000, '2020-08-01'],
    ['Karthik Raman', 'Male', 'Hair Transplant Technician', 'Clinical', 'Anna Nagar', 32000, '2022-01-17'],
    ['Meena Iyer', 'Female', 'Front Office Executive', 'Front Office', 'T. Nagar', 19500, '2023-06-05'],
    ['Rahul Nair', 'Male', 'Tele Caller', 'Tele Calling', 'Velachery', 16500, '2024-02-12'],
    ['Sneha Krishnan', 'Female', 'Accounts Executive', 'Accounts', 'Anna Nagar', 28000, '2021-11-22'],
    ['Vignesh Kumar', 'Male', 'Sales Counsellor', 'Sales', 'Adyar', 24000, '2023-09-18'],
    ['Lakshmi Pillai', 'Female', 'HR Executive', 'HR', 'Anna Nagar', 30000, '2020-03-02'],
    ['Suresh Reddy', 'Male', 'Skin Therapist', 'Clinical', 'Adyar', 22000, '2024-07-01'],
  ];

  const employees: Employee[] = people.map(([name, gender, designation, department, branch, gross, joinDate], i) => ({
    id: `EMP-seed-${i + 1}`,
    empCode: `RP${1001 + i}`,
    name, gender, designation, department, branch, joinDate,
    dob: `19${88 + (i % 9)}-0${(i % 9) + 1}-1${i % 9}`,
    phone: `98400${String(11111 + i * 1371).slice(0, 5)}`,
    email: `${name.toLowerCase().replace(/dr\.\s*/, '').split(' ')[0]}@renewplus.in`,
    address: `${12 + i}, ${['Gandhi Street', 'Lake View Road', 'Nehru Nagar', 'Temple Road'][i % 4]}, Chennai`,
    bloodGroup: ['O+', 'B+', 'A+', 'AB+', 'O-'][i % 5],
    reportingTo: i === 0 ? 'Managing Director' : 'Anitha Mohan',
    employmentType: 'Full Time',
    pan: `ABCPK${1234 + i}L`,
    aadhaarLast4: String(4821 + i * 7).slice(-4),
    uan: `1009${String(87654321 + i * 911)}`,
    bankName: ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank'][i % 4],
    accountNo: `50100${String(23456789 + i * 1234)}`,
    ifsc: ['HDFC0001234', 'ICIC0004567', 'SBIN0007890', 'UTIB0002345'][i % 4],
    emergencyContact: `Spouse - 9840${String(222333 + i * 17)}`,
    salary: structureFromGross(gross),
    status: 'Active',
  }));
  employees[8].status = 'On Notice';

  // Attendance: last 20 days (Sundays off), today partially punched.
  const attendance: AttendanceRecord[] = [];
  for (let back = 20; back >= 0; back--) {
    const date = ago(back);
    if (new Date(`${date}T00:00:00`).getDay() === 0) continue;
    for (const e of employees) {
      const r = rand();
      const id = uid('ATT');
      if (back === 0) {
        if (r < 0.75) attendance.push({ id, empId: e.id, date, checkIn: at(date, 9, 10 + Math.floor(r * 40)), checkOut: null, status: r > 0.6 ? 'Late' : 'Present', source: 'Biometric' });
        continue;
      }
      if (r < 0.04) attendance.push({ id, empId: e.id, date, checkIn: null, checkOut: null, status: 'Absent', source: 'Biometric' });
      else if (r < 0.1) attendance.push({ id, empId: e.id, date, checkIn: at(date, 9, 30), checkOut: at(date, 13, 40), status: 'Half Day', source: 'Biometric' });
      else if (r < 0.2) attendance.push({ id, empId: e.id, date, checkIn: at(date, 9, 50 + Math.floor(rand() * 9)), checkOut: at(date, 18, 30 + Math.floor(rand() * 29)), status: 'Late', source: 'Biometric' });
      else attendance.push({ id, empId: e.id, date, checkIn: at(date, 9, 5 + Math.floor(rand() * 35)), checkOut: at(date, 18, Math.floor(rand() * 59)), status: 'Present', source: 'Biometric' });
    }
  }

  const year = new Date().getFullYear();
  const leaves: LeaveRequest[] = [
    { id: 'LV-seed-1', requestNo: `LV-${year}-0003`, empId: employees[3].id, kind: 'Leave', leaveType: 'Sick Leave', fromDate: addDays(today, 1), toDate: addDays(today, 2), halfDay: false, fromTime: null, toTime: null, reason: 'Viral fever - doctor advised rest.', appliedAt: new Date().toISOString(), status: 'Pending' },
    { id: 'LV-seed-2', requestNo: `PM-${year}-0002`, empId: employees[4].id, kind: 'Permission', leaveType: null, fromDate: today, toDate: today, halfDay: false, fromTime: '16:00', toTime: '18:00', reason: 'Bank work.', appliedAt: new Date().toISOString(), status: 'Pending' },
    { id: 'LV-seed-3', requestNo: `LV-${year}-0001`, empId: employees[2].id, kind: 'Leave', leaveType: 'Casual Leave', fromDate: ago(9), toDate: ago(8), halfDay: false, fromTime: null, toTime: null, reason: 'Family function.', appliedAt: at(ago(12), 10, 0), status: 'Approved', reviewedBy: 'Lakshmi Pillai', reviewedAt: at(ago(11), 11, 0), reviewRemarks: 'Approved' },
  ];

  const manpower: ManpowerRequest[] = [
    { id: 'MR-seed-2', requestNo: `MR-${year}-0002`, branch: 'Adyar', department: 'Front Office', designation: 'Front Office Executive', positions: 1, employmentType: 'Full Time', experience: '1-3 years', budgetMin: 18000, budgetMax: 22000, skills: 'Customer handling, billing, English & Tamil', justification: 'Weekend footfall increased by 40%.', replacementFor: '', requiredBy: addDays(today, 20), requestedBy: 'Anitha Mohan', requestedAt: at(ago(1), 11, 0), status: 'Pending', postedTo: [], hired: 0 },
    { id: 'MR-seed-1', requestNo: `MR-${year}-0001`, branch: 'Velachery', department: 'Clinical', designation: 'Skin Therapist', positions: 2, employmentType: 'Full Time', experience: '2-5 years', budgetMin: 20000, budgetMax: 28000, skills: 'Chemical peels, laser, HydraFacial', justification: 'New laser room opening + replacement for Suresh Reddy.', replacementFor: 'Suresh Reddy', requiredBy: addDays(today, 10), requestedBy: 'Dr. Priya Sharma', requestedAt: at(ago(10), 10, 0), status: 'Approved', reviewedBy: 'Lakshmi Pillai', reviewRemarks: 'Approved within budget', vacancyStatus: 'Open', postedTo: ['Indeed', 'LinkedIn', 'Naukri'], hired: 0 },
  ];

  const candidates: Candidate[] = [];
  (['Indeed', 'LinkedIn', 'Naukri', 'Naukri', 'LinkedIn', 'Indeed', 'Referral'] as Candidate['source'][]).forEach((src, i) => {
    const c = makeCandidate(manpower[1], src, rand, 8 - i);
    c.stage = (['Interview', 'Shortlisted', 'Applied', 'Offered', 'Applied', 'Rejected', 'Shortlisted'] as CandidateStage[])[i];
    c.rating = [4, 3, 0, 5, 0, 2, 4][i];
    if (c.stage === 'Interview') {
      c.interviewAt = at(addDays(today, 1), 11, 30);
      c.interview = { scheduledAt: c.interviewAt, interviewer: 'Dr. Priya Sharma', mode: 'In-person', scheduledBy: 'Lakshmi Pillai' };
    }
    if (c.stage === 'Shortlisted' || c.stage === 'Interview' || c.stage === 'Offered') {
      c.shortlistedBy = 'Lakshmi Pillai';
      c.shortlistedAt = at(ago(6), 10, 30);
    }
    if (c.stage === 'Offered') {
      const when = at(ago(4), 12, 0);
      c.interview = { scheduledAt: at(ago(5), 11, 0), interviewer: 'Dr. Priya Sharma', mode: 'In-person', scheduledBy: 'Lakshmi Pillai', interviewedAt: at(ago(5), 11, 0), performanceRating: 5, interviewNotes: 'Strong hands-on laser experience.' };
      c.review = { reviewedBy: 'Dr. Priya Sharma', reviewedAt: at(ago(5), 13, 0), rating: 5, comments: 'Confident, good with clients. Recommended.', decision: 'Selected' };
      c.verification = {
        startedAt: at(ago(4), 10, 0), startedBy: 'Lakshmi Pillai', backgroundCheck: 'Clear', backgroundRemarks: 'Previous employer confirmed.',
        completedAt: when, completedBy: 'Lakshmi Pillai',
        documents: VERIFICATION_DOCUMENTS.filter(d => d.required).map(d => ({ type: d.type, fileName: `${d.type.split(' ')[0]}.pdf`, uploadedAt: at(ago(4), 11, 0), uploadedBy: 'Lakshmi Pillai', status: 'Verified' as const, verifiedBy: 'Lakshmi Pillai', verifiedAt: when })),
      };
      c.offer = { offerNo: `OFR-${year}-0001`, releasedAt: at(ago(2), 10, 0), releasedBy: 'Lakshmi Pillai', monthlyGross: Math.min(manpower[1].budgetMax, Math.max(manpower[1].budgetMin, c.expectedCtc)), joiningDate: addDays(today, 15), validUntil: addDays(today, 5), response: 'Pending' };
    }
    if (c.stage === 'Rejected') {
      c.rejectedBy = 'Lakshmi Pillai';
      c.rejectedAt = at(ago(5), 15, 0);
      c.rejectionReason = 'Experience below requirement.';
      c.rejectedAtStage = 'Applied';
    }
    candidates.push(c);
  });

  const lastMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const workingDays = (() => {
    let d = 0;
    for (let i = 1; i <= daysInMonth(lastMonth); i++) if (new Date(`${lastMonth}-${String(i).padStart(2, '0')}T00:00:00`).getDay() !== 0) d++;
    return d;
  })();
  const payslips = employees.map((e, i) => ({ ...buildPayslip(e, lastMonth, workingDays, i === 4 ? 1 : 0, i === 1 ? 10000 : 0), status: 'Paid' as const, paidAt: at(`${lastMonth}-28`, 17, 0) }));

  const cycle = `FY ${year - 1}-${String(year).slice(2)}`;
  const appraisals: Appraisal[] = [
    { id: 'APR-seed-1', empId: employees[2].id, cycle, rating: 4, kpiScore: 86, strengths: 'Excellent graft handling, punctual.', improvements: 'Mentor juniors.', reviewer: 'Anitha Mohan', incrementPercent: 10, oldMonthlyGross: 32000, newMonthlyGross: 35200, effectiveFrom: `${year}-04-01`, status: 'Approved', createdAt: at(ago(5), 10, 0) },
    { id: 'APR-seed-2', empId: employees[3].id, cycle, rating: 3, kpiScore: 72, strengths: 'Friendly with customers.', improvements: 'Billing accuracy.', reviewer: 'Anitha Mohan', incrementPercent: 6, oldMonthlyGross: 19500, newMonthlyGross: 20670, effectiveFrom: `${year}-04-01`, status: 'Draft', createdAt: at(ago(3), 10, 0) },
  ];
  const bonuses: BonusRecord[] = [
    { id: 'BON-seed-1', empId: employees[1].id, type: 'Performance', amount: 10000, payMonth: lastMonth, reason: 'Highest procedure revenue', status: 'Paid' },
    { id: 'BON-seed-2', empId: employees[2].id, type: 'Performance', amount: 5000, payMonth: monthKey(), reason: `${cycle} appraisal`, status: 'Approved', appraisalId: 'APR-seed-1' },
  ];

  const newJoiner: Employee = {
    ...employees[3], id: 'EMP-seed-10', empCode: 'RP1010', name: 'Nithya Joseph', gender: 'Female', designation: 'Tele Caller', department: 'Tele Calling',
    branch: 'Anna Nagar', joinDate: addDays(today, 3), email: 'nithya@renewplus.in', salary: structureFromGross(17000), status: 'Onboarding',
  };
  employees.push(newJoiner);
  const onboarding: Onboarding[] = [{
    id: 'ONB-seed-1', empId: newJoiner.id, joinDate: newJoiner.joinDate, buddy: 'Rahul Nair', status: 'In Progress',
    checklist: ONBOARDING_CHECKLIST.map((label, i) => ({ label, done: i < 3 })),
  }];

  const exitEmp = employees[8];
  const exits: ExitCase[] = [{
    id: 'EXT-seed-1', empId: exitEmp.id, exitType: 'Resignation', resignationDate: ago(12), lastWorkingDay: addDays(today, 18),
    reason: 'Relocating to Bengaluru.', status: 'Notice Period',
    checklist: EXIT_CHECKLIST.map((label, i) => ({ label, done: i < 2 })),
    fnf: { pendingSalary: 15000, leaveEncashment: 4200, bonus: 0, gratuity: 0, recoveries: 1500 },
  }];

  // Sample breaks on worked days: morning break, lunch and evening break (today only has the morning one).
  attendance.forEach(a => {
    if (!a.checkIn || a.status === 'Half Day') return;
    const mk = (type: BreakType, h: number, m: number, minutes: number): AttendanceBreak => {
      const start = at(a.date, h, m);
      return { type, start, end: new Date(new Date(start).getTime() + minutes * 60000).toISOString() };
    };
    a.breaks = a.date === today ? [mk('Morning Break', 11, 0, 12)] : [mk('Morning Break', 11, 0, 10 + Math.floor(rand() * 6)), mk('Lunch', 13, 15, 30 + Math.floor(rand() * 16)), mk('Evening Break', 16, 30, 10 + Math.floor(rand() * 6))];
  });

  return { employees, attendance, leaves, manpower, candidates, payslips, appraisals, bonuses, onboarding, exits };
}
