import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subject, catchError, concatMap, EMPTY, forkJoin, map, of, tap } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { isAdmin } from '../../core/auth/auth.model';
import {
  BranchPerformance, BranchTarget, CategoryResult, DEFAULT_RULES, EmployeePerformance, EmployeeTarget, IncentiveRules, IncentiveSlab,
  TREATMENT_CATEGORIES, TreatmentCategory, billCategory, emptyAmounts, isTreatmentStaff, slabRate, targetStatus,
} from '../models/targets.model';
import { AccountsService } from './accounts.service';
import { ApiRoutesConstants } from './api-route-constants';
import { BranchContextService } from './branch-context.service';
import { BranchOptionsService } from './branch-options.service';
import { HrService } from './hr.service';
import { ToastService } from './toast.service';
import { apiErrorMessage } from './work-task.service';

interface TargetsState {
  targets: BranchTarget[];
  employeeTargets: EmployeeTarget[];
  rules: IncentiveRules;
}

/** One collected receipt, credited to a branch / seller / treatment category. */
interface Credit {
  branch: string;
  employeeId: string | undefined;
  category: TreatmentCategory;
  amount: number;
}

export interface TargetAccess {
  /** all = admin / super admin (every branch and employee); branch = branch manager / head; self = own numbers only. */
  level: 'all' | 'branch' | 'self';
  branch: string | null;
  employeeId: string | null;
  /** Only admin / super admin set targets and incentive rules. */
  canEdit: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (achieved: number, target: number) => (target ? (achieved / target) * 100 : 0);

const emptyState = (): TargetsState => ({ targets: [], employeeTargets: [], rules: structuredClone(DEFAULT_RULES) });

/**
 * Targets and incentive rules, stored on the server (GET/PUT/POST targets/...). Every change goes to the API and the signal is
 * refilled from its response; requests run one after another so quick edits of one table cannot overtake each other. Achievement
 * is still read live from the Accounts vouchers (computed here, not stored).
 */
@Injectable({ providedIn: 'root' })
export class TargetsService {
  private readonly acc = inject(AccountsService);
  private readonly hr = inject(HrService);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiDataService);
  private readonly units = inject(BranchOptionsService);
  private readonly context = inject(BranchContextService);
  private readonly toast = inject(ToastService);
  private readonly state = signal<TargetsState>(emptyState());
  private readonly queue = new Subject<Observable<unknown>>();
  readonly loading = signal(false);

  readonly targets = computed(() => this.state().targets);
  readonly employeeTargets = computed(() => this.state().employeeTargets);
  readonly rules = computed(() => this.state().rules);
  /** Branch names from GET /branches/options (live array, see BranchOptionsService). */
  readonly branches = this.hr.branches;
  readonly categories = TREATMENT_CATEGORIES;

  /** What the signed-in user may see: admins see every branch and employee. */
  readonly access = computed<TargetAccess>(() => {
    const user = this.auth.currentUser();
    const slug = user?.role?.slug ?? '';
    if (isAdmin(user?.role_id) || ['admin', 'super_admin'].includes(slug)) return { level: 'all', branch: null, employeeId: null, canEdit: true };
    const me = this.hr.employees().find(e => e.email.toLowerCase() === (user?.email ?? '').toLowerCase() || e.name.toLowerCase() === (user?.name ?? '').toLowerCase());
    const level = ['branch_manager', 'branch_head'].includes(slug) ? 'branch' : 'self';
    return { level, branch: me?.branch ?? null, employeeId: me?.id ?? null, canEdit: false };
  });

  readonly visibleBranches = computed(() => {
    const a = this.access();
    const names = this.hr.branchNames();
    return a.level === 'all' ? names : names.filter(b => b === a.branch);
  });

  constructor() {
    this.queue.pipe(concatMap(req => req.pipe(catchError(err => {
      this.toast.error('Could not save', apiErrorMessage(err, 'The change was not saved. The list has been refreshed.'));
      this.load();
      return EMPTY;
    })))).subscribe();

    // Load on first use and again whenever the data in force changes (other login, header branch / franchise filter).
    effect(() => {
      this.context.key();
      if (!this.auth.currentUser()) return;
      untracked(() => this.load());
    });
  }

  /** GET targets: branch targets, employee targets and the incentive rules. Employees are refreshed too: targets carry database employee ids. */
  load(): void {
    this.loading.set(true);
    forkJoin([this.hr.loadEmployees().pipe(catchError(() => of([]))), this.api.GET(ApiRoutesConstants.TARGETS) as Observable<any>]).subscribe({
      next: ([, res]) => { this.applyOverview(res?.data); this.loading.set(false); },
      error: err => { console.error('GET targets failed', err); this.loading.set(false); },
    });
  }

  // ---- Branch targets ----
  targetFor(branch: string, month: string): BranchTarget {
    return this.targets().find(t => t.branch === branch && t.month === month)
      ?? { branch, month, revenueTarget: 0, conversionTarget: 0, conversions: 0 };
  }

  /** PUT targets/branch. The table shows the new value at once; the saved row (with its database id) replaces it when the server answers. */
  setTarget(branch: string, month: string, patch: Partial<Pick<BranchTarget, 'revenueTarget' | 'conversionTarget' | 'conversions'>>): void {
    if (!this.access().canEdit) return;
    const unit = this.units.byName(branch);
    if (!unit) return;
    const clean = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])) as typeof patch;
    this.mutate(s => {
      const found = s.targets.find(t => t.branch === branch && t.month === month);
      if (found) Object.assign(found, clean);
      else s.targets.push({ branch, month, revenueTarget: 0, conversionTarget: 0, conversions: 0, ...clean });
    });
    const body: Record<string, unknown> = { branch_or_franchise_type: unit.type, branch_or_franchise_id: unit.id, month };
    if (clean.revenueTarget !== undefined) body['revenue_target'] = clean.revenueTarget;
    if (clean.conversionTarget !== undefined) body['conversion_target'] = clean.conversionTarget;
    if (clean.conversions !== undefined) body['conversions'] = clean.conversions;
    this.queue.next((this.api.PUT(`${ApiRoutesConstants.TARGETS}/branch`, body) as Observable<any>).pipe(
      tap((res: any) => this.mutate(s => {
        const saved = this.branchFromApi(res.data);
        const i = s.targets.findIndex(t => t.branch === saved.branch && t.month === saved.month);
        if (i >= 0) s.targets[i] = saved; else s.targets.push(saved);
      })),
    ));
  }

  /**
   * POST targets/copy-previous: copies the previous month's branch and employee targets (not conversion counts) into `month`
   * where none are set. Emits how many were copied (0 when the user may not edit).
   */
  copyFromPrevious(month: string): Observable<number> {
    if (!this.access().canEdit) return of(0);
    return (this.api.POST(`${ApiRoutesConstants.TARGETS}/copy-previous`, { month }) as Observable<any>).pipe(
      tap(res => this.applyOverview(res?.data)),
      map(res => Number(res?.copied) || 0),
    );
  }

  /** PUT targets/rules with both parts at once (one audit entry per change). */
  saveRules(slabs: IncentiveSlab[], perConversion: number, conversionBonus: number): void {
    if (!this.access().canEdit) return;
    const rules = {
      slabs: slabs.filter(x => x.minPercent >= 0 && x.ratePercent >= 0).sort((a, b) => a.minPercent - b.minPercent),
      perConversion: Math.max(0, Number(perConversion) || 0), conversionBonus: Math.max(0, Number(conversionBonus) || 0),
    };
    this.putRules(rules, { slabs: rules.slabs.map(s => ({ min_percent: s.minPercent, rate_percent: s.ratePercent })), per_conversion: rules.perConversion, conversion_bonus: rules.conversionBonus });
  }

  setSlabs(slabs: IncentiveSlab[]): void {
    if (!this.access().canEdit) return;
    const clean = slabs.filter(x => x.minPercent >= 0 && x.ratePercent >= 0).sort((a, b) => a.minPercent - b.minPercent);
    this.putRules({ slabs: clean }, { slabs: clean.map(s => ({ min_percent: s.minPercent, rate_percent: s.ratePercent })) });
  }

  setTelecallerRules(perConversion: number, conversionBonus: number): void {
    if (!this.access().canEdit) return;
    const rules = { perConversion: Math.max(0, Number(perConversion) || 0), conversionBonus: Math.max(0, Number(conversionBonus) || 0) };
    this.putRules(rules, { per_conversion: rules.perConversion, conversion_bonus: rules.conversionBonus });
  }

  private putRules(local: Partial<IncentiveRules>, body: Record<string, unknown>): void {
    this.mutate(s => { Object.assign(s.rules, local); });
    this.queue.next((this.api.PUT(`${ApiRoutesConstants.TARGETS}/rules`, body) as Observable<any>).pipe(
      tap((res: any) => this.mutate(s => { s.rules = this.rulesFromApi(res.data); })),
    ));
  }

  // ---- Employee + treatment targets ----
  /** PUT targets/employee. */
  setEmployeeTarget(employeeId: string, month: string, category: TreatmentCategory, amount: number): void {
    if (!this.access().canEdit) return;
    const value = Math.max(0, Number(amount) || 0);
    this.mutate(s => {
      const found = s.employeeTargets.find(t => t.employeeId === employeeId && t.month === month);
      if (found) found.amounts[category] = value;
      else s.employeeTargets.push({ employeeId, month, amounts: { ...emptyAmounts(), [category]: value } });
    });
    this.queue.next((this.api.PUT(`${ApiRoutesConstants.TARGETS}/employee`, { employee_id: Number(employeeId), month, amounts: { [category.toLowerCase()]: value } }) as Observable<any>).pipe(
      tap((res: any) => this.mutate(s => {
        const saved = this.employeeFromApi(res.data);
        const i = s.employeeTargets.findIndex(t => t.employeeId === saved.employeeId && t.month === saved.month);
        if (i >= 0) s.employeeTargets[i] = saved; else s.employeeTargets.push(saved);
      })),
    ));
  }

  private amountsFor(employeeId: string, month: string): Record<TreatmentCategory, number> {
    return this.employeeTargets().find(t => t.employeeId === employeeId && t.month === month)?.amounts ?? emptyAmounts();
  }

  // ---- Achievement ----
  /** Collections (cash + bank receipts, contra excluded) posted to the branch in the month. */
  achieved(branch: string, month: string): number {
    const cashIds = new Set(this.acc.cashLedgers().map(l => l.id));
    return round2(this.acc.vouchers()
      .filter(v => v.branch === branch && v.type !== 'Contra' && v.date.startsWith(month))
      .reduce((sum, v) => sum + v.entries.filter(e => cashIds.has(e.ledgerId)).reduce((s, e) => s + e.debit, 0), 0));
  }

  /** Bill collections of the month, credited to the bill's seller and treatment category. */
  private credits(month: string): Credit[] {
    const cashIds = new Set(this.acc.cashLedgers().map(l => l.id));
    const bills = new Map(this.acc.bills().map(b => [b.id, b]));
    const out: Credit[] = [];
    for (const v of this.acc.vouchers()) {
      if (v.type !== 'Receipt' || !v.billId || !v.date.startsWith(month)) continue;
      const bill = bills.get(v.billId);
      const category = bill ? billCategory(bill.items) : null;
      if (!bill || !category) continue;
      const amount = v.entries.filter(e => cashIds.has(e.ledgerId)).reduce((s, e) => s + e.debit, 0);
      out.push({ branch: bill.branch, employeeId: bill.employeeId, category, amount });
    }
    return out;
  }

  private rollup(target: Record<TreatmentCategory, number>, achieved: Record<TreatmentCategory, number>): { categories: Record<TreatmentCategory, CategoryResult>; target: number; achieved: number; percent: number } {
    const categories = Object.fromEntries(TREATMENT_CATEGORIES.map(c => [c, { target: target[c], achieved: round2(achieved[c]), percent: pct(achieved[c], target[c]) }])) as Record<TreatmentCategory, CategoryResult>;
    const t = TREATMENT_CATEGORIES.reduce((s, c) => s + target[c], 0);
    const a = round2(TREATMENT_CATEGORIES.reduce((s, c) => s + achieved[c], 0));
    return { categories, target: t, achieved: a, percent: pct(a, t) };
  }

  /** Employees whose numbers the signed-in user may see. */
  scopedEmployees() {
    const a = this.access();
    return this.hr.activeEmployees().filter(e => isTreatmentStaff(e)
      && (a.level === 'all' || (a.level === 'branch' ? e.branch === a.branch : e.id === a.employeeId)));
  }

  employeePerformance(month: string): EmployeePerformance[] {
    const rules = this.rules();
    const credits = this.credits(month);
    return this.scopedEmployees().map(e => {
      const achieved = emptyAmounts();
      for (const c of credits) if (c.employeeId === e.id) achieved[c.category] += c.amount;
      const r = this.rollup(this.amountsFor(e.id, month), achieved);
      const rate = r.target ? slabRate(r.percent, rules.slabs) : 0;
      return {
        employeeId: e.id, targetId: this.employeeTargets().find(t => t.employeeId === e.id && t.month === month)?.id, name: e.name, designation: e.designation, branch: e.branch, ...r,
        slabRate: rate, incentive: round2((r.achieved * rate) / 100), status: targetStatus(r.target, r.percent),
      };
    }).sort((a, b) => a.branch.localeCompare(b.branch) || b.achieved - a.achieved);
  }

  /** Treatment-wise results per visible branch (employee targets of that branch vs collections credited to it). */
  treatmentPerformance(month: string) {
    const credits = this.credits(month);
    const staff = this.scopedEmployees();
    const rows = this.visibleBranches().map(branch => {
      const target = emptyAmounts();
      for (const e of staff.filter(x => x.branch === branch)) {
        const amounts = this.amountsFor(e.id, month);
        for (const c of TREATMENT_CATEGORIES) target[c] += amounts[c];
      }
      const achieved = emptyAmounts();
      for (const c of credits) if (c.branch === branch && (this.access().level !== 'self' || c.employeeId === this.access().employeeId)) achieved[c.category] += c.amount;
      return { branch, ...this.rollup(target, achieved) };
    });
    const totalTarget = emptyAmounts();
    const totalAchieved = emptyAmounts();
    for (const r of rows) for (const c of TREATMENT_CATEGORIES) { totalTarget[c] += r.categories[c].target; totalAchieved[c] += r.categories[c].achieved; }
    return { rows, total: this.rollup(totalTarget, totalAchieved) };
  }

  performance(month: string): BranchPerformance[] {
    const rules = this.rules();
    return this.visibleBranches().map(branch => {
      const t = this.targetFor(branch, month);
      const achieved = this.achieved(branch, month);
      const percent = pct(achieved, t.revenueTarget);
      const rate = t.revenueTarget ? slabRate(percent, rules.slabs) : 0;
      const conversionPercent = pct(t.conversions, t.conversionTarget);
      const revenueIncentive = round2((achieved * rate) / 100);
      const telecallerIncentive = t.conversions * rules.perConversion + (t.conversionTarget && t.conversions >= t.conversionTarget ? rules.conversionBonus : 0);
      return {
        branch, targetId: t.id, revenueTarget: t.revenueTarget, achieved, percent, slabRate: rate, revenueIncentive,
        conversionTarget: t.conversionTarget, conversions: t.conversions, conversionPercent, telecallerIncentive,
        totalIncentive: revenueIncentive + telecallerIncentive, status: targetStatus(t.revenueTarget, percent),
      };
    });
  }

  private mutate(fn: (draft: TargetsState) => void): void {
    const draft = structuredClone(this.state());
    fn(draft);
    this.state.set(draft);
  }

  private applyOverview(data: any): void {
    if (!data) return;
    this.state.set({
      targets: ((data.branch_targets ?? []) as any[]).map(r => this.branchFromApi(r)),
      employeeTargets: ((data.employee_targets ?? []) as any[]).map(r => this.employeeFromApi(r)),
      rules: data.rules ? this.rulesFromApi(data.rules) : structuredClone(DEFAULT_RULES),
    });
  }

  private branchFromApi(r: any): BranchTarget {
    return {
      id: String(r.id),
      branch: this.units.byKey(r.key)?.name ?? r.branch ?? '',
      month: r.month,
      revenueTarget: Number(r.revenue_target) || 0,
      conversionTarget: Number(r.conversion_target) || 0,
      conversions: Number(r.conversions) || 0,
    };
  }

  private employeeFromApi(r: any): EmployeeTarget {
    const a = r.amounts ?? {};
    return { id: String(r.id), employeeId: String(r.employee_id), month: r.month, amounts: { Hair: Number(a.Hair) || 0, Skin: Number(a.Skin) || 0, Slimming: Number(a.Slimming) || 0, Combo: Number(a.Combo) || 0 } };
  }

  private rulesFromApi(r: any): IncentiveRules {
    return {
      id: r.id ? String(r.id) : undefined,
      slabs: ((r.slabs ?? []) as any[]).map(s => ({ minPercent: Number(s.min_percent) || 0, ratePercent: Number(s.rate_percent) || 0 })).sort((a, b) => a.minPercent - b.minPercent),
      perConversion: Number(r.per_conversion) || 0,
      conversionBonus: Number(r.conversion_bonus) || 0,
    };
  }
}
