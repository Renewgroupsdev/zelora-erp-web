import { Injectable, computed, effect, inject, signal } from '@angular/core';
import Swal from 'sweetalert2';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from './api-route-constants';
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
  KycDocument,
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
  private readonly api = inject(ApiDataService);
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
    return this.registerEmployee({ ...input, id: uid('EMP'), empCode: this.nextEmpCode(), status: 'Onboarding' }, candidateId);
  }

  /** Puts a new employee in the store and starts their onboarding checklist. */
  private registerEmployee(employee: Employee, candidateId?: string): Employee {
    const onboarding: Onboarding = {
      id: uid('ONB'),
      empId: employee.id,
      candidateId,
      joinDate: employee.joinDate,
      buddy: employee.reportingTo,
      checklist: ONBOARDING_CHECKLIST.map(label => ({ label, done: label === 'Offer letter signed' && !!candidateId })),
      status: 'In Progress',
    };
    this.patch({ employees: [employee, ...this.employees().filter(e => e.id !== employee.id)], onboarding: [onboarding, ...this.onboarding()] });
    this.alert('New employee onboarding', `${employee.name} (${employee.empCode}) joins ${employee.branch} on ${employee.joinDate}.`, '/app/hr/onboarding-exit');
    return employee;
  }

  // ---- Employees API (hr/employees) ----

  /** Branch names <-> ids for the employee form (employees reference a branch by id). */
  readonly branchOptions = signal<{ id: number; name: string }[]>([]);

  loadBranches(): Observable<{ id: number; name: string }[]> {
    return (this.api.GetAllPages(ApiRoutesConstants.Branch_List_Options) as Observable<{ id: number; name: string }[]>).pipe(
      catchError(() => of([])),
      tap(list => this.branchOptions.set(list.map(b => ({ id: b.id, name: b.name })))),
    );
  }

  /** Replaces the store's employees with every employee from the API (all pages). */
  loadEmployees(): Observable<Employee[]> {
    const page = (n: number) => this.api.GET(`${ApiRoutesConstants.HR_EMPLOYEES}?per_page=200&page=${n}`) as Observable<any>;
    return page(1).pipe(
      switchMap(first => {
        const last = Number(first?.pagination?.last_page ?? 1);
        const rest = last > 1 ? forkJoin(Array.from({ length: last - 1 }, (_, i) => page(i + 2))) : of([] as any[]);
        return rest.pipe(map(more => [first, ...more].flatMap(r => (r?.data ?? []) as any[])));
      }),
      map(rows => rows.map(r => this.employeeFromApi(r))),
      tap(list => this.patch({ employees: list })),
    );
  }

  /** One employee with the full bank account number and KYC documents (the list masks the account). */
  fetchEmployee(id: string): Observable<Employee> {
    return (this.api.GET(`${ApiRoutesConstants.HR_EMPLOYEES}/${id}`) as Observable<any>).pipe(
      map(res => this.employeeFromApi(res.data)),
      tap(emp => this.patch({ employees: this.employees().some(e => e.id === emp.id) ? this.employees().map(e => (e.id === emp.id ? emp : e)) : [emp, ...this.employees()] })),
    );
  }

  /**
   * Creates (id = null) or updates an employee, then syncs the KYC documents: documents picked in the form
   * (with a `file`) are uploaded and those in `removedKycIds` are deleted. Emits the refreshed employee.
   */
  saveEmployee(id: string | null, input: NewEmployeeInput, opts: { photo: File | null; removePhoto: boolean; removedKycIds: string[]; candidateId?: string | null; password?: string; passwordConfirmation?: string; telecaller?: boolean }): Observable<Employee> {
    const body = this.employeeFormData(input, opts.photo, opts.removePhoto);
    if (opts.telecaller) {
      body.append('extension', input.extension ?? '');
      body.append('device_type', input.deviceType || 'sip');
      body.append('sip_username', input.sipUsername ?? '');
      body.append('sip_domain', input.sipDomain ?? '');
    }
    if (opts.password) {
      body.append('password', opts.password);
      body.append('password_confirmation', opts.passwordConfirmation ?? '');
    }
    const save$: Observable<any> = id
      ? this.api.POST(`${ApiRoutesConstants.HR_EMPLOYEES}/${id}`, (body.append('_method', 'PUT'), body))
      : this.api.POST(ApiRoutesConstants.HR_EMPLOYEES, body);

    return save$.pipe(
      switchMap(res => {
        const empId = String(res.data.id);
        const uploads = (input.kycDocuments ?? []).filter(d => d.file).map(d => {
          const form = new FormData();
          form.append('type', d.type);
          form.append('number', d.number ?? '');
          form.append('file', d.file!);
          return this.api.POST(`${ApiRoutesConstants.HR_EMPLOYEES}/${empId}/kyc-documents`, form) as Observable<any>;
        });
        const removals = opts.removedKycIds.map(docId => this.api.Delete(`${ApiRoutesConstants.HR_EMPLOYEES}/${empId}/kyc-documents/${docId}`, {}) as Observable<any>);
        const sync$ = uploads.length || removals.length ? forkJoin([...uploads, ...removals]) : of([]);
        return sync$.pipe(switchMap(() => this.fetchEmployee(empId)));
      }),
      tap(emp => {
        if (id) return;
        const candidate = opts.candidateId ? this.candidates().find(c => c.id === opts.candidateId) : null;
        if (candidate && this.awaitingJoining(candidate)) {
          this.updateCandidate(candidate.id, x => this.advance(x, 'Hired', 'Employee record created, onboarding started'));
          this.registerEmployee(emp, candidate.id);
        } else {
          this.registerEmployee(emp);
        }
      }),
    );
  }

  deleteEmployee(id: string): Observable<unknown> {
    return (this.api.Delete(`${ApiRoutesConstants.HR_EMPLOYEES}/${id}`, {}) as Observable<unknown>).pipe(
      tap(() => this.patch({ employees: this.employees().filter(e => e.id !== id) })),
    );
  }

  /** Opens a KYC document in a new tab: a freshly picked file from memory, a saved one streamed from the API. */
  viewKycDocument(empId: string, doc: KycDocument): void {
    if (doc.dataUrl) return void window.open(doc.dataUrl, '_blank', 'noopener');
    const tab = window.open('', '_blank');
    (this.api.GET_BLOB(`${ApiRoutesConstants.HR_EMPLOYEES}/${empId}/kyc-documents/${doc.id}/download`) as Observable<Blob>).subscribe({
      next: blob => {
        const url = URL.createObjectURL(new Blob([blob], { type: doc.mime || blob.type }));
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
      },
      error: () => {
        tab?.close();
        Swal.fire({ icon: 'error', title: 'Could not open the document', confirmButtonColor: '#6C63FF' });
      },
    });
  }

  private employeeFromApi(r: any): Employee {
    const s = r.salary ?? {};
    return {
      id: String(r.id), empCode: r.emp_code, name: r.name, gender: r.gender, dob: r.dob ?? null,
      phone: r.phone ?? '', secondaryPhone: r.secondary_phone ?? '', email: r.email ?? '', address: r.address ?? '', bloodGroup: r.blood_group ?? '',
      photo: r.profile_photo ? r.profile_photo_url : '',
      userType: r.user_type === 'management' ? 'Management' : 'Staff',
      extension: r.telephony_extension?.extension ?? '', deviceType: r.telephony_extension?.device_type ?? 'sip',
      sipUsername: r.telephony_extension?.sip_username ?? '', sipDomain: r.telephony_extension?.sip_domain ?? '',
      designation: r.designation ?? '', department: r.department ?? '', branch: r.branch?.name ?? '', reportingTo: r.reporting_to ?? '',
      joinDate: r.join_date, employmentType: r.employment_type,
      pan: r.pan ?? '', aadhaarLast4: r.aadhaar_last4 ?? '', uan: r.uan ?? '', bankName: r.bank_name ?? '',
      accountNo: r.account_no ?? r.account_no_masked ?? '', ifsc: r.ifsc ?? '', emergencyContact: r.emergency_contact ?? '',
      referralSource: r.referral_source ?? '', referredBy: r.referred_by ?? '', referralPhone: r.referral_phone ?? '',
      kycDocuments: (r.kyc_documents ?? []).map((d: any): KycDocument => ({
        id: String(d.id), type: d.type, number: d.number ?? '', fileName: d.file_name, mime: d.mime ?? '', size: d.size ?? 0, uploadedAt: d.uploaded_at ?? '',
      })),
      salary: {
        basic: Number(s.basic ?? 0), hra: Number(s.hra ?? 0), conveyance: Number(s.conveyance ?? 0), special: Number(s.special ?? 0),
        pfPercent: Number(s.pf_percent ?? 12), esiApplicable: !!s.esi_applicable, professionalTax: Number(s.professional_tax ?? 0),
      },
      status: r.status,
    };
  }

  /** Multipart body (the photo travels with the fields); empty values go as '' which the API reads as null. */
  private employeeFormData(e: NewEmployeeInput, photo: File | null, removePhoto: boolean): FormData {
    const f = new FormData();
    const put = (key: string, value: unknown) => f.append(key, value === null || value === undefined ? '' : String(value));
    const orgUnit = this.branchOptions().find(b => b.name === e.branch);

    put('name', e.name); put('gender', e.gender); put('dob', e.dob);
    put('phone', e.phone); put('secondary_phone', e.secondaryPhone); put('email', e.email);
    put('address', e.address); put('blood_group', e.bloodGroup);
    put('user_type', (e.userType ?? 'Staff').toLowerCase());
    put('designation', e.designation); put('department', e.department); put('org_unit_id', orgUnit?.id);
    put('reporting_to', e.reportingTo); put('join_date', e.joinDate); put('employment_type', e.employmentType);
    put('pan', e.pan); put('aadhaar_last4', e.aadhaarLast4); put('uan', e.uan);
    put('bank_name', e.bankName); put('account_no', e.accountNo); put('ifsc', e.ifsc);
    put('emergency_contact', e.emergencyContact);
    put('referral_source', e.referralSource); put('referred_by', e.referredBy); put('referral_phone', e.referralPhone);
    put('salary[basic]', e.salary.basic || 0); put('salary[hra]', e.salary.hra || 0);
    put('salary[conveyance]', e.salary.conveyance || 0); put('salary[special]', e.salary.special || 0);
    put('salary[pf_percent]', e.salary.pfPercent ?? 12); put('salary[esi_applicable]', e.salary.esiApplicable ? 1 : 0);
    put('salary[professional_tax]', e.salary.professionalTax || 0);
    if (photo) f.append('profile_photo', photo);
    else if (removePhoto) f.append('remove_profile_photo', '1');
    return f;
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

  const year = new Date().getFullYear();
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

  return { employees: [], attendance: [], leaves: [], manpower, candidates, payslips: [], appraisals: [], bonuses: [], onboarding: [], exits: [] };
}
