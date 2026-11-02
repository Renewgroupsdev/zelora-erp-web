import { Injectable, computed, effect, inject, signal } from '@angular/core';
import Swal from 'sweetalert2';
import { Observable, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from './api-route-constants';
import { FileUploadService } from './file-upload.service';
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
  Employee,
  KycDocument,
  EXIT_CHECKLIST,
  ChecklistItem,
  ExitCase,
  FULL_DAY_HOURS,
  InterviewMode,
  JobPortal,
  LEAVE_QUOTA,
  LeaveBalanceRow,
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
import { addDays, daysInMonth, isoDate, loadState, monthKey, saveState, seqNo, uid } from '../utils/format.util';
import { NotificationService } from './notification.service';
import { BranchOption, BranchOptionsService } from './branch-options.service';
import { DepartmentOptionsService } from './department-options.service';

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

export interface AttendanceRegisterRow {
  empId: string; empCode: string; name: string; department: string;
  /** "branch:1" / "franchise:7" - matches BranchOption.key. */
  unitKey: string;
  status: string; source: string; remarks: string;
}

/** One employee's totals in GET /hr/attendance/summary. */
export interface AttendanceMonthRow {
  empId: string; empCode: string; name: string; department: string;
  /** "branch:1" / "franchise:7" - matches BranchOption.key. */
  unitKey: string;
  present: number; late: number; halfDay: number; absent: number; onLeave: number; permission: number;
  workedHours: number; avgHours: number;
}

export interface AttendanceMonthSummary {
  workingDays: number; present: number; late: number; halfDay: number; absent: number; onLeave: number; permission: number; workedHours: number;
}

export type NewEmployeeInput = Omit<Employee, 'id' | 'empCode' | 'status'>;
export interface EmployeeHistory { leaves: LeaveRequest[]; payslips: Payslip[]; appraisals: Appraisal[]; bonuses: BonusRecord[]; balance: { type: LeaveType; quota: number; used: number; balance: number }[] }

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
  private readonly uploads = inject(FileUploadService);
  private readonly branchList = inject(BranchOptionsService);
  private readonly departmentList = inject(DepartmentOptionsService);
  private readonly state = signal<HrState>(loadState(STORAGE_KEY, seedState));

  readonly employees = computed(() => this.state().employees);
  /** Employee stat-card counts from the list API's `summary` (overall, not search/page dependent). */
  readonly employeeSummary = signal<{ active: number; onboarding: number; on_notice: number; monthly_payroll: number }>({ active: 0, onboarding: 0, on_notice: 0, monthly_payroll: 0 });
  readonly attendance = computed(() => this.state().attendance);
  readonly leaves = computed(() => this.state().leaves);
  readonly manpower = computed(() => this.state().manpower);
  readonly candidates = computed(() => this.state().candidates);
  readonly payslips = computed(() => this.state().payslips);
  readonly appraisals = computed(() => this.state().appraisals);
  readonly bonuses = computed(() => this.state().bonuses);
  readonly onboarding = computed(() => this.state().onboarding);
  readonly exits = computed(() => this.state().exits);

  /** Branch names from GET /branches/options (one live array, refilled when the options load). */
  readonly branches = this.branchList.nameList;
  /** Same names as a signal, for computed()s. */
  readonly branchNames = this.branchList.names;
  /** Active department names from Settings -> Department Module (one live array, refilled when the list loads). */
  readonly departments = this.departmentList.nameList;
  readonly activeEmployees = computed(() => this.employees().filter(e => e.status !== 'Exited'));
  readonly vacancies = computed(() => this.manpower().filter(m => m.status === 'Approved'));
  readonly pendingLeaves = computed(() => this.leaves().filter(l => l.status === 'Pending').length);
  readonly pendingManpower = computed(() => this.manpower().filter(m => m.status === 'Pending').length);
  /** HR / branch heads / admins approve; other staff only raise requests. */
  readonly canApprove = computed(() => !isTelecallerRole(this.auth.currentUser()));

  constructor() {
    effect(() => saveState(STORAGE_KEY, this.state()));
    this.branchList.ensure();
    this.departmentList.ensure();
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
  readonly branchOptions = this.branchList.options;

  /** GET /departments/options (shared with every other department dropdown and filter); `force` re-reads it. */
  loadDepartments(force = false): Observable<string[]> {
    return this.departmentList.load(force);
  }

  /** GET /branches/options (shared with every other branch dropdown). */
  loadBranches(): Observable<BranchOption[]> {
    return this.branchList.load();
  }

  /** Replaces the store's employees with every employee from the API (all pages). */
  loadEmployees(): Observable<Employee[]> {
    const page = (n: number) => this.api.GET(`${ApiRoutesConstants.HR_EMPLOYEES}?per_page=200&page=${n}`) as Observable<any>;
    return page(1).pipe(
      switchMap(first => {
        const s = first?.summary;
        if (s) this.employeeSummary.set({ active: Number(s.active) || 0, onboarding: Number(s.onboarding) || 0, on_notice: Number(s.on_notice) || 0, monthly_payroll: Number(s.monthly_payroll) || 0 });
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
    if (!id && opts.candidateId) body.append('candidate_id', opts.candidateId);
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
        if (id) { this.patch({ employees: [emp, ...this.employees().filter(e => e.id !== emp.id)] }); return; } // edited -> top of the list
        if (opts.candidateId) this.loadCandidates().subscribe({ error: () => undefined }); // the server linked the hire to the candidate
        this.registerEmployee(emp, opts.candidateId ?? undefined);
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
    if (doc.dataUrl || doc.url) return void window.open(doc.dataUrl || doc.url, '_blank', 'noopener');
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

  employeeFromApi(r: any): Employee {
    const s = r.salary ?? {};
    return {
      id: String(r.id), empCode: r.emp_code, name: r.name, gender: r.gender, dob: r.dob ?? null,
      phone: r.phone ?? '', secondaryPhone: r.secondary_phone ?? '', email: r.email ?? '', address: r.address ?? '', bloodGroup: r.blood_group ?? '',
      photo: r.profile_photo ? r.profile_photo_url : '',
      userType: r.user_type === 'management' ? 'Management' : 'Staff',
      extension: r.telephony_extension?.extension ?? '', deviceType: r.telephony_extension?.device_type ?? 'sip',
      sipUsername: r.telephony_extension?.sip_username ?? '', sipDomain: r.telephony_extension?.sip_domain ?? '',
      designation: r.designation ?? '', department: r.department ?? '', branch: r.branch?.name ?? '',
      branchId: r.branch_or_franchise_id ?? null,
      branchType: r.branch_or_franchise_type === 'franchise' || r.branch?.type === 'franchise' ? 'franchise' : 'branch',
      reportingTo: r.reporting_to ?? '',
      joinDate: r.join_date, employmentType: r.employment_type, isWfh: Number(r.is_wfh) === 0 ? 0 : 1,
      pan: r.pan ?? '', aadhaarLast4: r.aadhaar_last4 ?? '', uan: r.uan ?? '', bankName: r.bank_name ?? '',
      accountNo: r.account_no ?? r.account_no_masked ?? '', ifsc: r.ifsc ?? '', emergencyContact: r.emergency_contact ?? '',
      referralSource: r.referral_source ?? '', referredBy: r.referred_by ?? '', referralPhone: r.referral_phone ?? '',
      kycDocuments: (r.kyc_documents ?? []).map((d: any): KycDocument => ({
        id: String(d.id), type: d.type, number: d.number ?? '', fileName: d.file_name, url: d.url ?? undefined, mime: d.mime ?? '', size: d.size ?? 0, uploadedAt: d.uploaded_at ?? '',
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
    // Names are unique across types (a franchise's ends in "(Franchise)"); prefer an option of the picked type.
    const unit = this.branchOptions().find(b => b.name === e.branch && (!e.branchType || b.type === e.branchType))
      ?? this.branchOptions().find(b => b.name === e.branch);
    // The saved unit is no longer on offer (deactivated) and was not changed: keep it.
    const unitId = unit?.id ?? (e.branchId ?? null);
    const unitType = unit?.type ?? e.branchType ?? null;

    put('name', e.name); put('gender', e.gender); put('dob', e.dob);
    put('phone', e.phone); put('secondary_phone', e.secondaryPhone); put('email', e.email);
    put('address', e.address); put('blood_group', e.bloodGroup);
    put('user_type', (e.userType ?? 'Staff').toLowerCase());
    put('designation', e.designation); put('department', e.department); put('branch_or_franchise_type', unitType); put('branch_or_franchise_id', unitId);
    put('reporting_to', e.reportingTo); put('join_date', e.joinDate); put('employment_type', e.employmentType);
    put('is_wfh', e.isWfh === 0 ? '0' : '1'); // 0 = WFH, 1 = WFO
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
      designation: user.role?.name ?? 'Staff', department: this.departments[0] ?? '', branch: this.branches[0] ?? '', reportingTo: 'Branch Head',
      joinDate: isoDate(), employmentType: 'Full Time', pan: '', aadhaarLast4: '', uan: '', bankName: '', accountNo: '', ifsc: '',
      emergencyContact: '', salary: structureFromGross(0),
    };
    this.patch({ employees: [employee, ...this.employees()] });
    this.notifications.add({ type: 'hr', title: 'Employee record created', message: `${employee.name} (${employee.empCode}) was added from their login. Complete the details in Employees.`, link: '/app/hr/employees' });
    return employee;
  }

  updateEmployee(id: string, patch: Partial<Employee>): void {
    this.patch({ employees: this.front(this.employees().map(e => (e.id === id ? { ...e, ...patch } : e)), id) });
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

  // ---- Attendance API (hr/attendance) ----

  /** Stat cards of the loaded day, from GET /hr/attendance `stats` (whole register, not just the page). */
  readonly attendanceStats = signal<{ total: number; present: number; late: number; on_leave: number; absent_or_not_marked: number }>({ total: 0, present: 0, late: 0, on_leave: 0, absent_or_not_marked: 0 });
  /** Every employee on the loaded day's register (GET /hr/attendance `data`), punched or "Not Marked". */
  readonly attendanceRegister = signal<AttendanceRegisterRow[]>([]);
  /** The signed-in user's employee (GET /hr/attendance/me; the API creates one from the login if missing). */
  readonly myEmployeeId = signal<string | null>(null);

  /** API attendance row -> store record. `employee_id` is the employee's id; a "Not Marked" row has no `id` and is skipped by callers. */
  attendanceFromApi(r: any, fallbackDate = ''): AttendanceRecord {
    return {
      id: String(r.id), empId: String(r.employee_id), date: r.date ?? fallbackDate,
      checkIn: r.check_in ?? null, checkOut: r.check_out ?? null, status: r.status, source: r.source ?? 'Web',
      remarks: r.remarks ?? undefined, distanceM: r.login_distance_m ?? null,
      checkInPhotoUrl: r.check_in_photo_url ?? null, checkOutPhotoUrl: r.check_out_photo_url ?? null,
      checkOutDistanceM: r.check_out_distance_m ?? null, checkOutReason: r.check_out_reason ?? null,
      breaks: (r.breaks ?? []).map((b: any): AttendanceBreak => ({ type: b.type, start: b.start, end: b.end ?? null })),
    };
  }

  /** Puts records in the store (same employee + date is replaced). `replaceDate` first drops that day's stale rows. */
  private mergeAttendance(records: AttendanceRecord[], replaceDate?: string): void {
    const keep = this.attendance().filter(a => a.date !== replaceDate && !records.some(r => r.empId === a.empId && r.date === a.date));
    this.patch({ attendance: [...records, ...keep] });
  }

  /** Every employee's punch for `date` (all pages) -> store + stat cards. Not-marked employees simply have no record. */
  loadAttendanceDay(date: string): Observable<AttendanceRecord[]> {
    const page = (n: number) => this.api.GET(`${ApiRoutesConstants.HR_ATTENDANCE}?date=${date}&per_page=200&page=${n}`) as Observable<any>;
    return page(1).pipe(
      switchMap(first => {
        if (first?.stats) this.attendanceStats.set(first.stats);
        const last = Number(first?.pagination?.last_page ?? 1);
        const rest = last > 1 ? forkJoin(Array.from({ length: last - 1 }, (_, i) => page(i + 2))) : of([] as any[]);
        return rest.pipe(map(more => [first, ...more].flatMap(r => (r?.data ?? []) as any[])));
      }),
      tap(rows => this.attendanceRegister.set(rows.map((r): AttendanceRegisterRow => ({
        empId: String(r.employee_id), empCode: r.employee?.emp_code ?? '', name: r.employee?.name ?? '', department: r.employee?.department ?? '',
        unitKey: r.employee?.branch_or_franchise_id ? `${r.employee.branch_or_franchise_type}:${r.employee.branch_or_franchise_id}` : '',
        status: r.status ?? 'Not Marked', source: r.source ?? '', remarks: r.remarks ?? '',
      })))),
      // "Not Marked" rows have no attendance record (id null); only real punches go in the store.
      map(rows => rows.filter(r => r.id).map(r => this.attendanceFromApi(r, date))),
      tap(list => this.mergeAttendance(list, date)),
    );
  }

  /** Every employee's totals for the Monthly Summary's date range (GET /hr/attendance/summary). */
  readonly attendanceMonthly = signal<AttendanceMonthRow[]>([]);

  /** All employees' totals for a date range (from / to, YYYY-MM-DD) in one request (all pages of the endpoint, normally just one). */
  loadAttendanceRange(from: string, to: string): Observable<AttendanceMonthRow[]> {
    const page = (n: number) => this.api.GET(`${ApiRoutesConstants.HR_ATTENDANCE}/summary?from=${from}&to=${to}&per_page=200&page=${n}`) as Observable<any>;
    return page(1).pipe(
      switchMap(first => {
        const last = Number(first?.pagination?.last_page ?? 1);
        const rest = last > 1 ? forkJoin(Array.from({ length: last - 1 }, (_, i) => page(i + 2))) : of([] as any[]);
        return rest.pipe(map(more => [first, ...more].flatMap(r => (r?.data ?? []) as any[])));
      }),
      map(rows => rows.map((r): AttendanceMonthRow => ({
        empId: String(r.employee_id), empCode: r.emp_code ?? '', name: r.name ?? '', department: r.department ?? '',
        unitKey: r.branch_or_franchise_id ? `${r.branch_or_franchise_type}:${r.branch_or_franchise_id}` : '',
        present: Number(r.present) || 0, late: Number(r.late) || 0, halfDay: Number(r.half_day) || 0, absent: Number(r.absent) || 0,
        onLeave: Number(r.on_leave) || 0, permission: Number(r.permission) || 0,
        workedHours: Number(r.worked_hours) || 0, avgHours: Number(r.avg_hours) || 0,
      }))),
      tap(list => this.attendanceMonthly.set(list)),
    );
  }

  /** One employee's month: every record (with breaks) plus the payroll summary. Also refreshes the store. */
  fetchEmployeeAttendance(empId: string, month: string): Observable<{ summary: AttendanceMonthSummary; records: AttendanceRecord[] }> {
    return (this.api.GET(`${ApiRoutesConstants.HR_EMPLOYEES}/${empId}/attendance?month=${month}`) as Observable<any>).pipe(
      map(res => {
        const s = res.data?.summary ?? {};
        const summary: AttendanceMonthSummary = {
          workingDays: Number(s.working_days) || 0, present: Number(s.present) || 0, late: Number(s.late) || 0, halfDay: Number(s.half_day) || 0,
          absent: Number(s.absent) || 0, onLeave: Number(s.on_leave) || 0, permission: Number(s.permission) || 0, workedHours: Number(s.worked_hours) || 0,
        };
        return { summary, records: ((res.data?.records ?? []) as any[]).map(r => this.attendanceFromApi({ ...r, employee_id: r.employee_id ?? empId })) };
      }),
      tap(({ records }) => this.mergeAttendance(records)),
    );
  }

  /** GET /hr/attendance/me: the signed-in user's employee id + today's punch. */
  loadMyAttendance(): Observable<AttendanceRecord | null> {
    return (this.api.GET(`${ApiRoutesConstants.HR_ATTENDANCE}/me`) as Observable<any>).pipe(
      map(res => {
        this.myEmployeeId.set(String(res.data.employee.id));
        return res.data.today ? this.attendanceFromApi(res.data.today, isoDate()) : null;
      }),
      tap(record => record && this.mergeAttendance([record])),
    );
  }

  /** Runs a self-service punch call and stores the record the API returns (it carries the breaks). */
  private punch(path: string, body: unknown = {}): Observable<AttendanceRecord> {
    return (this.api.POST(`${ApiRoutesConstants.HR_ATTENDANCE}/${path}`, body) as Observable<any>).pipe(
      map(res => this.attendanceFromApi(res.data, isoDate())),
      tap(record => this.mergeAttendance([record])),
    );
  }

  /** POST /hr/attendance/check-in. Optional device location is saved with the distance from the branch. */
  checkIn(location?: { latitude: number; longitude: number }): Observable<AttendanceRecord> {
    return this.punch('check-in', location ?? {});
  }

  /** POST /hr/attendance/check-out (closes a running break server-side). */
  checkOut(): Observable<AttendanceRecord> {
    return this.punch('check-out');
  }

  /** POST /hr/attendance/break/start { type }. The API refuses when not checked in, a break is running or the type was already taken. */
  startBreak(type: BreakType): Observable<AttendanceRecord> {
    return this.punch('break/start', { type });
  }

  /** POST /hr/attendance/break/end. */
  endBreak(): Observable<AttendanceRecord> {
    return this.punch('break/end');
  }

  /** POST /hr/attendance/mark: HR correction of a day. `checkIn` / `checkOut` are ISO strings or null. */
  markAttendance(empId: string, date: string, status: AttendanceStatus, checkIn: string | null, checkOut: string | null, remarks: string): Observable<AttendanceRecord> {
    // The API reads "HH:mm" as a time on `date` in the HR timezone; local HH:mm of the picked instant is that.
    const hhmm = (iso: string | null) => (iso ? `${String(new Date(iso).getHours()).padStart(2, '0')}:${String(new Date(iso).getMinutes()).padStart(2, '0')}` : null);
    const body = { employee_id: Number(empId), date, status, check_in: hhmm(checkIn), check_out: hhmm(checkOut), remarks };
    return (this.api.POST(`${ApiRoutesConstants.HR_ATTENDANCE}/mark`, body) as Observable<any>).pipe(
      map(res => this.attendanceFromApi(res.data, date)),
      tap(record => this.mergeAttendance([record])),
    );
  }

  /** GET /hr/attendance/export as a file (xlsx | csv | pdf). `params` = view, date | from + to, search, status, department, branch_or_franchise_id. */
  exportAttendance(params: Record<string, string | string[]>, format: 'xlsx' | 'csv' | 'pdf' = 'xlsx'): Observable<Blob> {
    const q = new URLSearchParams({ format });
    for (const [k, v] of Object.entries(params)) (Array.isArray(v) ? v : [v]).filter(Boolean).forEach(x => q.append(Array.isArray(v) ? `${k}[]` : k, x));
    return this.api.GET_BLOB(`${ApiRoutesConstants.HR_ATTENDANCE}/export?${q.toString()}`) as Observable<Blob>;
  }

  // ---- Leave & permission ----
  /** Every employee's leave balance from GET /hr/leave-balances (one row per employee on payroll). */
  readonly leaveBalanceRows = signal<LeaveBalanceRow[]>([]);

  leaveFromApi(r: any): LeaveRequest {
    return {
      id: String(r.id), requestNo: r.request_no, empId: String(r.employee_id),
      kind: r.kind, leaveType: r.leave_type ?? null, fromDate: r.from_date, toDate: r.to_date, halfDay: !!r.half_day,
      fromTime: r.from_time ?? null, toTime: r.to_time ?? null, reason: r.reason ?? '', appliedAt: r.applied_at,
      status: r.status, reviewedBy: r.reviewed_by ?? undefined, reviewedAt: r.reviewed_at ?? undefined, reviewRemarks: r.review_remarks ?? undefined,
      days: Number(r.days) || 0,
      employee: r.employee ? { code: r.employee.emp_code ?? '', name: r.employee.name ?? '', department: r.employee.department ?? '', branch: r.employee.branch ?? '' } : undefined,
    };
  }

  /** Every leave / permission request from GET /hr/leave-requests (all pages). */
  loadLeaves(): Observable<LeaveRequest[]> {
    const page = (n: number) => this.api.GET(`${ApiRoutesConstants.HR_LEAVE_REQUESTS}?per_page=200&page=${n}`) as Observable<any>;
    return page(1).pipe(
      switchMap(first => {
        const last = Number(first?.pagination?.last_page ?? 1);
        const rest = last > 1 ? forkJoin(Array.from({ length: last - 1 }, (_, i) => page(i + 2))) : of([] as any[]);
        return rest.pipe(map(more => [first, ...more].flatMap(r => (r?.data ?? []) as any[])));
      }),
      map(rows => rows.map(r => this.leaveFromApi(r))),
      tap(list => this.patch({ leaves: list })),
    );
  }

  loadLeaveBalances(): Observable<LeaveBalanceRow[]> {
    return (this.api.GET(ApiRoutesConstants.HR_LEAVE_BALANCES) as Observable<any>).pipe(
      map(res => ((res?.data ?? []) as any[]).map((r): LeaveBalanceRow => ({
        empId: String(r.employee_id), empCode: r.emp_code ?? '', name: r.name ?? '', department: r.department ?? '', branch: r.branch ?? '',
        balances: (r.balances ?? []).map((b: any) => ({ type: b.type as LeaveType, quota: Number(b.quota) || 0, used: Number(b.used) || 0, balance: Number(b.balance) || 0 })),
      }))),
      tap(rows => this.leaveBalanceRows.set(rows)),
    );
  }

  /** Files a leave / permission (POST /hr/leave-requests), then reloads the requests and balances. */
  applyLeave(input: NewLeaveInput): Observable<LeaveRequest> {
    const body = {
      employee_id: Number(input.empId), kind: input.kind, leave_type: input.leaveType, from_date: input.fromDate, to_date: input.toDate,
      half_day: input.halfDay, from_time: input.fromTime, to_time: input.toTime, reason: input.reason,
    };
    return (this.api.POST(ApiRoutesConstants.HR_LEAVE_REQUESTS, body) as Observable<any>).pipe(
      map(res => this.leaveFromApi(res.data)),
      switchMap(request => forkJoin([this.loadLeaves(), this.loadLeaveBalances()]).pipe(map(() => request))),
      tap(request => this.alert(`${input.kind} request`, `${request.employee?.name ?? this.employeeName(input.empId)} applied for ${input.kind === 'Leave' ? input.leaveType : 'permission'} - waiting for HR approval.`, '/app/hr/leave-permission')),
    );
  }

  /** Approves / rejects (POST /hr/leave-requests/{id}/review); the server posts approved days onto the attendance register. */
  reviewLeave(id: string, approve: boolean, remarks: string): Observable<unknown> {
    return (this.api.POST(`${ApiRoutesConstants.HR_LEAVE_REQUESTS}/${id}/review`, { approve, remarks }) as Observable<unknown>).pipe(
      switchMap(() => forkJoin([this.loadLeaves(), this.loadLeaveBalances()])),
    );
  }

  leaveDays(l: Pick<LeaveRequest, 'kind' | 'fromDate' | 'toDate' | 'halfDay'> & { days?: number }): number {
    if (l.kind === 'Permission') return 0;
    if (l.days !== undefined && l.days !== null && !Number.isNaN(l.days) && l.days > 0) return l.days;
    if (l.halfDay) return 0.5;
    let days = 0;
    for (let d = l.fromDate; d <= l.toDate; d = addDays(d, 1)) if (new Date(`${d}T00:00:00`).getDay() !== 0) days++;
    return days;
  }

  leaveBalance(empId: string): { type: LeaveType; quota: number; used: number; balance: number }[] {
    const row = this.leaveBalanceRows().find(r => r.empId === empId);
    if (row) return row.balances;
    return (Object.keys(LEAVE_QUOTA) as LeaveType[]).map(type => ({ type, quota: LEAVE_QUOTA[type], used: 0, balance: LEAVE_QUOTA[type] }));
  }

  // ---- Manpower requests / vacancies (GET / POST /hr/manpower-requests) ----
  manpowerFromApi(r: any): ManpowerRequest {
    const n = (v: unknown) => Number(v) || 0;
    const postings = (r.postings ?? []) as { portal: JobPortal; status: string }[];
    return {
      id: String(r.id), requestNo: r.request_no, branch: r.branch?.name ?? '', department: r.department ?? '', designation: r.designation ?? '',
      positions: n(r.positions), employmentType: r.employment_type, experience: r.experience ?? '',
      budgetMin: n(r.budget_min), budgetMax: n(r.budget_max), skills: r.skills ?? '', justification: r.justification ?? '',
      replacementFor: r.replacement_for ?? '', requiredBy: r.required_by ?? null,
      requestedBy: r.requested_by ?? '', requestedAt: r.requested_at ?? '', status: r.status,
      reviewedBy: r.reviewed_by ?? undefined, reviewRemarks: r.review_remarks ?? undefined,
      vacancyStatus: r.vacancy_status ?? undefined,
      // Only portals the job really went to; "Pending" ones still need HR to post them by hand.
      postedTo: postings.filter(p => p.status === 'Posted').map(p => p.portal),
      hired: n(r.hired),
    };
  }

  /** Every page of a list endpoint (per_page 200). */
  private fetchAll(path: string): Observable<any[]> {
    const page = (n: number) => this.api.GET(`${path}${path.includes('?') ? '&' : '?'}per_page=200&page=${n}`) as Observable<any>;
    return page(1).pipe(
      switchMap(first => {
        const last = Number(first?.pagination?.last_page ?? 1);
        const rest = last > 1 ? forkJoin(Array.from({ length: last - 1 }, (_, i) => page(i + 2))) : of([] as any[]);
        return rest.pipe(map(more => [first, ...more].flatMap(r => (r?.data ?? []) as any[])));
      }),
    );
  }

  /** Replaces the store's manpower requests / vacancies with the server's. */
  loadManpower(): Observable<ManpowerRequest[]> {
    return this.fetchAll(ApiRoutesConstants.HR_MANPOWER).pipe(
      map(rows => rows.map(r => this.manpowerFromApi(r))),
      tap(list => this.patch({ manpower: list })),
    );
  }

  /** Replaces the store's candidates with the server's (list rows carry no history / documents; the detail call fills those). */
  loadCandidates(): Observable<Candidate[]> {
    return this.fetchAll(ApiRoutesConstants.HR_CANDIDATES).pipe(
      map(rows => rows.map(r => this.candidateFromApi(r, this.candidates().find(c => c.id === String(r.id))))),
      tap(list => this.patch({ candidates: list })),
    );
  }

  /** The Recruitment tab's data: manpower requests + candidates. */
  loadRecruitment(): Observable<unknown> {
    return forkJoin([this.loadManpower(), this.loadCandidates()]);
  }

  private putManpower(m: ManpowerRequest): ManpowerRequest {
    this.patch({ manpower: [m, ...this.manpower().filter(x => x.id !== m.id)] });
    return m;
  }

  private manpowerAction(id: string, path: string, body: unknown): Observable<ManpowerRequest> {
    return (this.api.POST(`${ApiRoutesConstants.HR_MANPOWER}/${id}/${path}`, body) as Observable<any>).pipe(
      map(res => this.putManpower(this.manpowerFromApi(res.data?.vacancy ?? res.data))),
    );
  }

  createManpower(input: NewManpowerInput): Observable<ManpowerRequest> {
    const unit = this.branchOptions().find(b => b.name === input.branch);
    const body = {
      branch_or_franchise_type: unit?.type ?? null, branch_or_franchise_id: unit?.id ?? null,
      department: input.department, designation: input.designation, positions: input.positions, employment_type: input.employmentType,
      experience: input.experience, budget_min: input.budgetMin, budget_max: input.budgetMax, skills: input.skills,
      justification: input.justification, replacement_for: input.replacementFor, required_by: input.requiredBy,
    };
    return (this.api.POST(ApiRoutesConstants.HR_MANPOWER, body) as Observable<any>).pipe(map(res => this.putManpower(this.manpowerFromApi(res.data))));
  }

  reviewManpower(id: string, approve: boolean, remarks: string): Observable<ManpowerRequest> {
    return this.manpowerAction(id, 'review', { approve, remarks });
  }

  setVacancyStatus(id: string, vacancyStatus: NonNullable<ManpowerRequest['vacancyStatus']>): Observable<ManpowerRequest> {
    return this.manpowerAction(id, 'vacancy-status', { vacancy_status: vacancyStatus });
  }

  /** POST post-to-portals. LinkedIn posts through its API; Indeed / Naukri come back "Pending" (post by hand, then link). */
  postToPortals(id: string, portals: JobPortal[]): Observable<{ portal: string; status: string; message: string }[]> {
    return (this.api.POST(`${ApiRoutesConstants.HR_MANPOWER}/${id}/post-to-portals`, { portals }) as Observable<any>).pipe(
      tap(res => { if (res.data?.vacancy) this.putManpower(this.manpowerFromApi(res.data.vacancy)); }),
      map(res => (res.data?.results ?? []) as { portal: string; status: string; message: string }[]),
    );
  }

  /** Pulls the portal's new applicants into the vacancy (LinkedIn API); reloads the candidates. */
  syncApplicants(vacancyId: string, portal: JobPortal): Observable<{ created: number; skipped: number }> {
    return (this.api.POST(`${ApiRoutesConstants.HR_MANPOWER}/${vacancyId}/sync-applicants`, { portal }) as Observable<any>).pipe(
      switchMap(res => this.loadCandidates().pipe(map(() => ({ created: Number(res.data?.created) || 0, skipped: Number(res.data?.skipped) || 0 })))),
    );
  }

  /** Adds a walk-in / referral by hand (POST /hr/candidates). */
  addCandidate(candidate: Omit<Candidate, 'id' | 'appliedAt' | 'stage' | 'resumeFile'>): Observable<Candidate> {
    const body = {
      vacancy_id: Number(candidate.vacancyId), name: candidate.name, email: candidate.email, phone: candidate.phone, source: candidate.source,
      profile_url: candidate.profileUrl, location: candidate.location, experience_years: candidate.experienceYears, current_company: candidate.currentCompany,
      current_ctc: candidate.currentCtc, expected_ctc: candidate.expectedCtc, notice_days: candidate.noticeDays, skills: candidate.skills, education: candidate.education, notes: candidate.notes,
    };
    return (this.api.POST(ApiRoutesConstants.HR_CANDIDATES, body) as Observable<any>).pipe(map(res => this.putCandidate(this.candidateFromApi(res.data))));
  }

  /** Local-only stage tweak (the "Reschedule" button reopens the scheduling form); the server moves a candidate only through the actions below. */
  moveCandidate(id: string, stage: CandidateStage, patch: Partial<Candidate> = {}): void {
    this.patch({ candidates: this.front(this.candidates().map(c => (c.id === id ? { ...c, ...patch, stage } : c)), id) });
  }

  // ---- Candidate hiring workflow (GET /hr/candidates, POST /hr/candidates/{id}/...) ----
  /** API candidate -> Candidate. "By whom" names come from the history; `prev` keeps history / documents a list row does not carry. */
  candidateFromApi(r: any, prev?: Candidate): Candidate {
    const n = (v: unknown) => Number(v) || 0;
    const history: CandidateEvent[] | undefined = r.history
      ? (r.history as any[]).map(e => ({ at: e.at, by: e.by ?? '', stage: e.stage, action: e.action, ...(e.note ? { note: e.note } : {}) }))
      : prev?.history;
    const by = (re: RegExp) => [...(history ?? [])].reverse().find(h => re.test(h.action))?.by ?? '';
    const iv = r.interview;
    const rv = r.review;
    const rj = r.rejection;
    const vf = r.verification;
    const of_ = r.offer;
    const docs: CandidateDocument[] = r.verification?.documents
      ? (vf.documents as any[]).map(d => ({
        id: String(d.id), type: d.type, fileName: d.file_name, url: d.url ?? undefined, uploadedAt: d.uploaded_at ?? '', uploadedBy: d.uploaded_by ?? '',
        status: d.status, verifiedBy: d.verified_by ?? undefined, verifiedAt: d.verified_at ?? undefined, remarks: d.remarks ?? undefined,
      }))
      : prev?.verification?.documents ?? [];
    return {
      id: String(r.id), vacancyId: String(r.vacancy_id), name: r.name ?? '', email: r.email ?? '', phone: r.phone ?? '', source: r.source,
      profileUrl: r.profile_url ?? '', location: r.location ?? '', experienceYears: n(r.experience_years), currentCompany: r.current_company ?? '',
      currentCtc: n(r.current_ctc), expectedCtc: n(r.expected_ctc), noticeDays: n(r.notice_days), skills: r.skills ?? '', education: r.education ?? '',
      appliedAt: r.applied_at ?? '', stage: r.stage, rating: n(r.rating), notes: r.notes ?? undefined, resumeFile: r.resume_file ?? '',
      interviewAt: iv?.scheduled_at ?? null,
      shortlistedAt: r.shortlisted_at ?? undefined, shortlistedBy: r.shortlisted_at ? by(/^Shortlisted/) : undefined,
      interview: iv ? {
        scheduledAt: iv.scheduled_at ?? iv.interviewed_at, interviewer: iv.interviewer ?? '', mode: iv.mode ?? 'In-person', scheduledBy: by(/^Interview (re)?scheduled/),
        interviewedAt: iv.interviewed_at ?? undefined, performanceRating: iv.performance_rating ?? undefined, interviewNotes: iv.notes ?? undefined,
      } : undefined,
      review: rv ? { reviewedBy: by(/after interview/), reviewedAt: rv.reviewed_at, rating: n(rv.rating), comments: rv.comments ?? '', decision: rv.decision } : undefined,
      rejectedBy: rj ? by(/^Rejected/) : undefined, rejectedAt: rj?.rejected_at ?? undefined, rejectionReason: rj?.reason ?? undefined, rejectedAtStage: rj?.at_stage ?? undefined,
      verification: vf ? {
        startedAt: vf.started_at, startedBy: by(/verification started/), documents: docs, backgroundCheck: vf.background_check ?? 'Pending',
        backgroundRemarks: vf.background_remarks ?? undefined, completedAt: vf.completed_at ?? undefined, completedBy: vf.completed_at ? by(/Verification completed/) : undefined,
      } : undefined,
      offer: of_ ? {
        offerNo: of_.offer_no, releasedAt: of_.released_at, releasedBy: by(/Offer letter released/), monthlyGross: n(of_.monthly_gross),
        joiningDate: of_.joining_date, validUntil: of_.valid_until, response: of_.response ?? 'Pending', respondedAt: of_.responded_at ?? undefined, responseRemarks: of_.response_remarks ?? undefined,
      } : undefined,
      history,
      employeeId: r.employee_id != null ? String(r.employee_id) : prev?.employeeId,
      awaitingJoining: r.awaiting_joining ?? prev?.awaitingJoining,
    };
  }

  private putCandidate(c: Candidate, toFront = true): Candidate {
    this.patch({ candidates: toFront ? [c, ...this.candidates().filter(x => x.id !== c.id)] : this.candidates().map(x => (x.id === c.id ? c : x)) });
    return c;
  }

  /** One candidate with history, documents and verification gaps (the Hiring process dialog). */
  fetchCandidate(id: string): Observable<Candidate> {
    return (this.api.GET(`${ApiRoutesConstants.HR_CANDIDATES}/${id}`) as Observable<any>).pipe(
      map(res => this.putCandidate(this.candidateFromApi(res.data, this.candidates().find(c => c.id === id)), false)), // a read: keep its place
    );
  }

  /** POST /hr/candidates/{id}/{path}; the server answers with the refreshed candidate. */
  private candidateAction(id: string, path: string, body: unknown = {}): Observable<Candidate> {
    return (this.api.POST(`${ApiRoutesConstants.HR_CANDIDATES}/${id}/${path}`, body) as Observable<any>).pipe(
      map(res => this.putCandidate(this.candidateFromApi(res.data, this.candidates().find(c => c.id === id)))),
    );
  }

  shortlistCandidate(id: string): Observable<Candidate> {
    return this.candidateAction(id, 'shortlist');
  }

  scheduleInterview(id: string, input: { scheduledAt: string; interviewer: string; mode: InterviewMode }): Observable<Candidate> {
    return this.candidateAction(id, 'schedule-interview', { scheduled_at: input.scheduledAt, interviewer: input.interviewer, mode: input.mode });
  }

  /** The interview took place: store the interviewer's performance rating and notes. */
  recordInterview(id: string, input: { interviewedAt: string; performanceRating: number; notes: string }): Observable<Candidate> {
    return this.candidateAction(id, 'record-interview', { interviewed_at: input.interviewedAt, performance_rating: input.performanceRating, notes: input.notes });
  }

  /** Final review after the interview: Selected moves on to verification, Rejected closes the candidate. */
  reviewCandidate(id: string, input: { rating: number; comments: string; selected: boolean }): Observable<Candidate> {
    return this.candidateAction(id, 'review', input);
  }

  rejectCandidate(id: string, reason: string): Observable<Candidate> {
    return this.candidateAction(id, 'reject', { reason });
  }

  startVerification(id: string): Observable<Candidate> {
    return this.candidateAction(id, 'start-verification');
  }

  /** Uploads a verification document (POST multipart); a replaced file is deleted by the server. */
  uploadCandidateDocument(id: string, type: string, file: File): Observable<Candidate> {
    const form = new FormData();
    form.append('type', type);
    form.append('file', file);
    return this.candidateAction(id, 'documents', form);
  }

  verifyCandidateDocument(id: string, type: string, verified: boolean, remarks: string): Observable<Candidate> {
    const doc = this.candidates().find(c => c.id === id)?.verification?.documents.find(d => d.type === type);
    return this.candidateAction(id, `documents/${doc?.id}/verify`, { verified, remarks });
  }

  /** Opens an uploaded verification document in a new tab (the file is behind the API token). */
  viewCandidateDocument(candidateId: string, doc: CandidateDocument): void {
    const tab = window.open('', '_blank');
    (this.api.GET_BLOB(`${ApiRoutesConstants.HR_CANDIDATES}/${candidateId}/documents/${doc.id}/download`) as Observable<Blob>).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
      },
      error: () => {
        tab?.close();
        Swal.fire({ icon: 'error', title: 'Could not open the document', confirmButtonColor: '#6C63FF' });
      },
    });
  }

  setBackgroundCheck(id: string, status: BackgroundCheckStatus, remarks: string): Observable<Candidate> {
    return (this.api.PUT(`${ApiRoutesConstants.HR_CANDIDATES}/${id}/background-check`, { status, remarks }) as Observable<any>).pipe(
      map(res => this.putCandidate(this.candidateFromApi(res.data, this.candidates().find(c => c.id === id)))),
    );
  }

  /** What still blocks the offer: missing / unverified required documents and the background check. */
  verificationGaps(c: Candidate): string[] {
    const v = c.verification;
    if (!v) return ['Verification has not started'];
    const gaps = VERIFICATION_DOCUMENTS.filter(d => d.required && v.documents.find(x => x.type === d.type)?.status !== 'Verified').map(d => `${d.type} not verified`);
    if (v.backgroundCheck !== 'Clear') gaps.push(`Background check is ${v.backgroundCheck.toLowerCase()}`);
    return gaps;
  }

  completeVerification(id: string): Observable<Candidate> {
    return this.candidateAction(id, 'complete-verification');
  }

  /** Releases the offer letter. Needs completed verification (the server checks). */
  releaseOffer(id: string, input: { monthlyGross: number; joiningDate: string; validUntil: string }): Observable<Candidate> {
    return this.candidateAction(id, 'release-offer', { monthly_gross: input.monthlyGross, joining_date: input.joiningDate, valid_until: input.validUntil });
  }

  /** Candidate's answer to the offer: accepted -> hired (a position is filled), declined -> Offer Declined. */
  respondToOffer(id: string, accepted: boolean, remarks: string): Observable<Candidate> {
    return this.candidateAction(id, 'offer-response', { accepted, remarks }).pipe(
      tap(() => this.loadManpower().subscribe({ error: () => undefined })), // hired count / vacancy status moved
    );
  }

  /** The employee created from this candidate, if any. */
  employeeForCandidate(candidateId: string): Employee | undefined {
    const id = this.candidates().find(c => c.id === candidateId)?.employeeId;
    return id ? this.employee(id) : undefined;
  }

  /** A hired candidate who has no employee record yet. */
  awaitingJoining(c: Candidate): boolean {
    return c.awaitingJoining ?? (c.stage === 'Hired' && !c.employeeId);
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

  // ---- Payroll ----
  workingDays(month: string): number {
    let days = 0;
    for (let d = 1; d <= daysInMonth(month); d++) if (new Date(`${month}-${String(d).padStart(2, '0')}T00:00:00`).getDay() !== 0) days++;
    return days;
  }

  payslipFromApi(r: any): Payslip {
    const e = r.earnings ?? {};
    const d = r.deductions ?? {};
    const n = (v: unknown) => Number(v) || 0;
    return {
      id: String(r.id), month: r.month, empId: String(r.employee_id),
      workingDays: n(r.working_days), paidDays: n(r.paid_days), lopDays: n(r.lop_days),
      earnings: { basic: n(e.basic), hra: n(e.hra), conveyance: n(e.conveyance), special: n(e.special), bonus: n(e.bonus) },
      deductions: { pf: n(d.pf), esi: n(d.esi), professionalTax: n(d.professional_tax), lop: n(d.lop), advance: n(d.advance) },
      gross: n(r.gross), totalDeductions: n(r.total_deductions), net: n(r.net),
      status: r.status === 'Paid' ? 'Paid' : 'Processed', paidAt: r.paid_at ?? undefined,
      employee: r.employee ? {
        code: r.employee.emp_code ?? '', name: r.employee.name ?? '', branch: r.employee.branch ?? '',
        department: r.employee.department ?? '', designation: r.employee.designation ?? '',
      } : undefined,
    };
  }

  /** Every payslip of the month from GET /hr/payslips (all pages); replaces that month's slips in the store. */
  loadPayslips(month: string): Observable<Payslip[]> {
    const page = (n: number) => this.api.GET(`${ApiRoutesConstants.HR_PAYSLIPS}?month=${month}&per_page=200&page=${n}`) as Observable<any>;
    return page(1).pipe(
      switchMap(first => {
        const last = Number(first?.pagination?.last_page ?? 1);
        const rest = last > 1 ? forkJoin(Array.from({ length: last - 1 }, (_, i) => page(i + 2))) : of([] as any[]);
        return rest.pipe(map(more => [first, ...more].flatMap(r => (r?.data ?? []) as any[])));
      }),
      map(rows => rows.map(r => this.payslipFromApi(r))),
      tap(list => this.patch({ payslips: list })), // drops any stale payslips a previous (local mock) session left in the browser
    );
  }

  /** Builds the month's payslips on the server (POST /hr/payroll/run; already-paid slips are kept), then reloads them. */
  runPayroll(month: string): Observable<number> {
    return (this.api.POST(ApiRoutesConstants.HR_PAYROLL_RUN, { month }) as Observable<any>).pipe(
      switchMap(res => this.loadPayslips(month).pipe(map(() => Number(res?.data?.processed) || 0))),
    );
  }

  /** Marks payslips paid (POST /hr/payslips/mark-paid) and reloads their month. */
  markPaid(ids: string[], month: string): Observable<number> {
    return (this.api.POST(`${ApiRoutesConstants.HR_PAYSLIPS}/mark-paid`, { ids: ids.map(Number) }) as Observable<any>).pipe(
      switchMap(res => this.loadPayslips(month).pipe(map(() => Number(res?.data?.paid) || 0))),
    );
  }

  // ---- Appraisals & bonus ----
  /** Every row of a paginated HR list endpoint (all pages, 200 per page). */
  private fetchAllPages(path: string): Observable<any[]> {
    const sep = path.includes('?') ? '&' : '?';
    const page = (n: number) => this.api.GET(`${path}${sep}per_page=200&page=${n}`) as Observable<any>;
    return page(1).pipe(
      switchMap(first => {
        const last = Number(first?.pagination?.last_page ?? 1);
        const rest = last > 1 ? forkJoin(Array.from({ length: last - 1 }, (_, i) => page(i + 2))) : of([] as any[]);
        return rest.pipe(map(more => [first, ...more].flatMap(r => (r?.data ?? []) as any[])));
      }),
    );
  }

  appraisalFromApi(r: any): Appraisal {
    const e = r.employee;
    return {
      id: String(r.id), empId: String(r.employee_id), cycle: r.cycle, rating: Number(r.rating) || 0, kpiScore: Number(r.kpi_score) || 0,
      strengths: r.strengths ?? '', improvements: r.improvements ?? '', reviewer: r.reviewer ?? '',
      incrementPercent: Number(r.increment_percent) || 0, oldMonthlyGross: Number(r.old_monthly_gross) || 0, newMonthlyGross: Number(r.new_monthly_gross) || 0,
      effectiveFrom: r.effective_from, status: r.status, createdAt: r.created_at,
      employee: e ? { code: e.emp_code ?? '', name: e.name ?? '', department: e.department ?? '', designation: e.designation ?? '', branch: e.branch ?? '' } : undefined,
    };
  }

  bonusFromApi(r: any): BonusRecord {
    const e = r.employee;
    return {
      id: String(r.id), empId: String(r.employee_id), type: r.type, amount: Number(r.amount) || 0, payMonth: r.pay_month,
      reason: r.reason ?? '', status: r.status === 'Paid' ? 'Paid' : 'Approved', appraisalId: r.appraisal_id ? String(r.appraisal_id) : undefined,
      employee: e ? { code: e.emp_code ?? '', name: e.name ?? '', department: e.department ?? '', branch: e.branch ?? '' } : undefined,
    };
  }

  /** GET /hr/appraisals (all pages) into the store. */
  loadAppraisals(): Observable<Appraisal[]> {
    return this.fetchAllPages(ApiRoutesConstants.HR_APPRAISALS).pipe(
      map(rows => rows.map(r => this.appraisalFromApi(r))),
      tap(list => this.patch({ appraisals: list })),
    );
  }

  /** GET /hr/bonuses (all pages) into the store. */
  loadBonuses(): Observable<BonusRecord[]> {
    return this.fetchAllPages(ApiRoutesConstants.HR_BONUSES).pipe(
      map(rows => rows.map(r => this.bonusFromApi(r))),
      tap(list => this.patch({ bonuses: list })),
    );
  }

  /** Saves a draft appraisal (with its optional bonus) and reloads both lists. */
  createAppraisal(input: NewAppraisalInput): Observable<Appraisal> {
    const body = {
      employee_id: Number(input.empId), cycle: input.cycle, rating: input.rating, kpi_score: input.kpiScore,
      strengths: input.strengths || null, improvements: input.improvements || null, reviewer: input.reviewer,
      increment_percent: input.incrementPercent, effective_from: input.effectiveFrom,
      bonus: input.bonus?.amount ? { type: input.bonus.type, amount: input.bonus.amount, pay_month: input.bonus.payMonth } : null,
    };
    return (this.api.POST(ApiRoutesConstants.HR_APPRAISALS, body) as Observable<any>).pipe(
      map(res => this.appraisalFromApi(res.data)),
      switchMap(appraisal => forkJoin([this.loadAppraisals(), this.loadBonuses()]).pipe(map(() => appraisal))),
    );
  }

  approveAppraisal(id: string): Observable<unknown> {
    return (this.api.POST(`${ApiRoutesConstants.HR_APPRAISALS}/${id}/approve`, {}) as Observable<unknown>).pipe(switchMap(() => this.loadAppraisals()));
  }

  /** Releases the letter; the server moves the employee to the revised salary, so the employee is re-read too. */
  releaseAppraisal(id: string): Observable<unknown> {
    const a = this.appraisals().find(x => x.id === id);
    return (this.api.POST(`${ApiRoutesConstants.HR_APPRAISALS}/${id}/release`, {}) as Observable<unknown>).pipe(
      switchMap(() => forkJoin([this.loadAppraisals(), a ? this.fetchEmployee(a.empId) : of(null)])),
      tap(() => { if (a) this.alert('Appraisal released', `${a.employee?.name ?? this.employeeName(a.empId)}: ${a.incrementPercent}% increment effective ${a.effectiveFrom}.`, '/app/hr/appraisals'); }),
    );
  }

  /** The appraisal & increment letter PDF from the server (opened in a new tab). */
  openAppraisalLetter(id: string): void {
    const tab = window.open('', '_blank');
    (this.api.GET_BLOB(`${ApiRoutesConstants.HR_APPRAISALS}/${id}/letter`) as Observable<Blob>).subscribe({
      next: blob => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
      },
      error: () => {
        tab?.close();
        Swal.fire({ icon: 'error', title: 'Could not open the letter', confirmButtonColor: '#6C63FF' });
      },
    });
  }

  addBonus(input: Omit<BonusRecord, 'id' | 'status'>): Observable<unknown> {
    const body = { employee_id: Number(input.empId), type: input.type, amount: input.amount, pay_month: input.payMonth, reason: input.reason };
    return (this.api.POST(ApiRoutesConstants.HR_BONUSES, body) as Observable<unknown>).pipe(switchMap(() => this.loadBonuses()));
  }

  // ---- Onboarding (in) / exit (out) ----
  private checklistFromApi(list: any): ChecklistItem[] {
    return ((list ?? []) as any[]).map(c => ({ label: String(c.label), done: !!c.done }));
  }

  private caseEmployee(e: any): { code: string; name: string; designation: string; department: string; branch: string } | undefined {
    return e ? { code: e.emp_code ?? '', name: e.name ?? '', designation: e.designation ?? '', department: e.department ?? '', branch: e.branch ?? '' } : undefined;
  }

  onboardingFromApi(r: any): Onboarding {
    return {
      id: String(r.id), empId: String(r.employee_id), candidateId: r.candidate_id ? String(r.candidate_id) : undefined,
      joinDate: r.join_date, buddy: r.buddy ?? '', checklist: this.checklistFromApi(r.checklist),
      status: r.status === 'Completed' ? 'Completed' : 'In Progress', employee: this.caseEmployee(r.employee),
    };
  }

  exitFromApi(r: any): ExitCase {
    const f = r.fnf ?? {};
    const n = (v: unknown) => Number(v) || 0;
    return {
      id: String(r.id), empId: String(r.employee_id), exitType: r.exit_type, resignationDate: r.resignation_date, lastWorkingDay: r.last_working_day,
      reason: r.reason ?? '', checklist: this.checklistFromApi(r.checklist),
      fnf: { pendingSalary: n(f.pending_salary), leaveEncashment: n(f.leave_encashment), bonus: n(f.bonus), gratuity: n(f.gratuity), recoveries: n(f.recoveries) },
      status: r.status, settledAt: r.settled_at ?? undefined, employee: this.caseEmployee(r.employee),
    };
  }

  /** GET /hr/onboardings (all pages) into the store. */
  loadOnboardings(): Observable<Onboarding[]> {
    return this.fetchAllPages(ApiRoutesConstants.HR_ONBOARDINGS).pipe(
      map(rows => rows.map(r => this.onboardingFromApi(r))),
      tap(list => this.patch({ onboarding: list })),
    );
  }

  /** GET /hr/exits (all pages) into the store. */
  loadExits(): Observable<ExitCase[]> {
    return this.fetchAllPages(ApiRoutesConstants.HR_EXITS).pipe(
      map(rows => rows.map(r => this.exitFromApi(r))),
      tap(list => this.patch({ exits: list })),
    );
  }

  /** Ticks / unticks one joining item (POST /hr/onboardings/{id}/toggle). Completing the last one makes the employee Active on the server. */
  toggleOnboardingItem(id: string, index: number): Observable<unknown> {
    return (this.api.POST(`${ApiRoutesConstants.HR_ONBOARDINGS}/${id}/toggle`, { index }) as Observable<unknown>).pipe(
      switchMap(() => this.loadOnboardings()),
    );
  }

  /** Starts an exit (POST /hr/exits): the server estimates the F&F and puts the employee on notice. */
  startExit(input: Pick<ExitCase, 'empId' | 'exitType' | 'resignationDate' | 'lastWorkingDay' | 'reason'>): Observable<ExitCase> {
    const body = { employee_id: Number(input.empId), exit_type: input.exitType, resignation_date: input.resignationDate, last_working_day: input.lastWorkingDay, reason: input.reason };
    return (this.api.POST(ApiRoutesConstants.HR_EXITS, body) as Observable<any>).pipe(
      map(res => this.exitFromApi(res.data)),
      switchMap(exit => forkJoin([this.loadExits(), this.loadEmployees()]).pipe(map(() => exit))),
      tap(exit => this.alert('Employee exit initiated', `${exit.employee?.name ?? this.employeeName(exit.empId)} - last working day ${exit.lastWorkingDay}.`, '/app/hr/onboarding-exit')),
    );
  }

  toggleExitItem(id: string, index: number): Observable<unknown> {
    return (this.api.POST(`${ApiRoutesConstants.HR_EXITS}/${id}/toggle`, { index }) as Observable<unknown>).pipe(switchMap(() => this.loadExits()));
  }

  updateFnf(id: string, fnf: ExitCase['fnf']): Observable<unknown> {
    const body = { pending_salary: fnf.pendingSalary, leave_encashment: fnf.leaveEncashment, bonus: fnf.bonus, gratuity: fnf.gratuity, recoveries: fnf.recoveries };
    return (this.api.PUT(`${ApiRoutesConstants.HR_EXITS}/${id}/fnf`, body) as Observable<unknown>).pipe(switchMap(() => this.loadExits()));
  }

  /** Settles the F&F (needs every clearance item done); the server marks the employee Exited and blocks their login. */
  settleExit(id: string): Observable<unknown> {
    return (this.api.POST(`${ApiRoutesConstants.HR_EXITS}/${id}/settle`, {}) as Observable<unknown>).pipe(
      switchMap(() => forkJoin([this.loadExits(), this.loadEmployees()])),
    );
  }

  /** One employee's own leave, payslips (every month), appraisals, bonuses and leave balance - for the profile, without touching the page lists in the store. */
  loadEmployeeHistory(empId: string): Observable<EmployeeHistory> {
    const q = `employee_id=${encodeURIComponent(empId)}`;
    return forkJoin({
      leaves: this.fetchAllPages(`${ApiRoutesConstants.HR_LEAVE_REQUESTS}?${q}`).pipe(map(rows => rows.map(r => this.leaveFromApi(r)))),
      payslips: this.fetchAllPages(`${ApiRoutesConstants.HR_PAYSLIPS}?${q}`).pipe(map(rows => rows.map(r => this.payslipFromApi(r)))),
      appraisals: this.fetchAllPages(`${ApiRoutesConstants.HR_APPRAISALS}?${q}`).pipe(map(rows => rows.map(r => this.appraisalFromApi(r)))),
      bonuses: this.fetchAllPages(`${ApiRoutesConstants.HR_BONUSES}?${q}`).pipe(map(rows => rows.map(r => this.bonusFromApi(r)))),
      balance: (this.api.GET(`${ApiRoutesConstants.HR_EMPLOYEES}/${empId}/leave-balance`) as Observable<any>).pipe(
        map(res => ((res?.data ?? []) as any[]).map(b => ({ type: b.type as LeaveType, quota: Number(b.quota) || 0, used: Number(b.used) || 0, balance: Number(b.balance) || 0 }))),
      ),
    }).pipe(
      // PayslipView reads the slip from the store: keep the profile's slips there so Open payslip works.
      tap(h => this.patch({ payslips: h.payslips })),
    );
  }

  /** Opens a server rendered PDF (F&F statement, relieving letter ...) in a new tab. */
  openPdf(path: string, failure = 'Could not open the document'): void {
    const tab = window.open('', '_blank');
    (this.api.GET_BLOB(path) as Observable<Blob>).subscribe({
      next: blob => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
      },
      error: () => {
        tab?.close();
        Swal.fire({ icon: 'error', title: failure, confirmButtonColor: '#6C63FF' });
      },
    });
  }

  fnfTotal(fnf: ExitCase['fnf']): number {
    return fnf.pendingSalary + fnf.leaveEncashment + fnf.bonus + fnf.gratuity - fnf.recoveries;
  }

  private alert(title: string, message: string, link: string): void {
    this.notifications.add({ type: 'hr', title, message, link });
    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title, text: message, showConfirmButton: false, timer: 4500, timerProgressBar: true });
  }

  /** Moves the row with `id` to the front (newly added / just edited rows lead every list). */
  private front<T extends { id: string }>(list: T[], id: string): T[] {
    const hit = list.find(x => x.id === id);
    return hit ? [hit, ...list.filter(x => x.id !== id)] : list;
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
