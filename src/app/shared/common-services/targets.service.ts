import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { isAdmin } from '../../core/auth/auth.model';
import {
  BranchPerformance, BranchTarget, CategoryResult, DEFAULT_RULES, EmployeePerformance, EmployeeTarget, IncentiveRules, IncentiveSlab,
  TREATMENT_CATEGORIES, TreatmentCategory, billCategory, emptyAmounts, isTreatmentStaff, slabRate, targetStatus,
} from '../models/targets.model';
import { BRANCHES, isoDate, loadState, saveState } from '../utils/format.util';
import { AccountsService } from './accounts.service';
import { HrService } from './hr.service';

const STORAGE_KEY = 'zelora_targets_store_v1';

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

/**
 * Front-end store for targets (design stage - no API yet). Achievement is read live from the Accounts
 * vouchers; the incentive rules below are what the backend must reproduce.
 */
@Injectable({ providedIn: 'root' })
export class TargetsService {
  private readonly acc = inject(AccountsService);
  private readonly hr = inject(HrService);
  private readonly auth = inject(AuthService);
  private readonly state = signal<TargetsState>(loadState(STORAGE_KEY, seedState));

  readonly targets = computed(() => this.state().targets);
  readonly employeeTargets = computed(() => this.state().employeeTargets);
  readonly rules = computed(() => this.state().rules);
  readonly branches = BRANCHES;
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
    return a.level === 'all' ? this.branches : this.branches.filter(b => b === a.branch);
  });

  constructor() {
    effect(() => saveState(STORAGE_KEY, this.state()));
  }

  // ---- Branch targets ----
  targetFor(branch: string, month: string): BranchTarget {
    return this.targets().find(t => t.branch === branch && t.month === month)
      ?? { branch, month, revenueTarget: 0, conversionTarget: 0, conversions: 0 };
  }

  setTarget(branch: string, month: string, patch: Partial<Pick<BranchTarget, 'revenueTarget' | 'conversionTarget' | 'conversions'>>): void {
    if (!this.access().canEdit) return;
    const clean = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, Math.max(0, Number(v) || 0)]));
    this.mutate(s => {
      const found = s.targets.find(t => t.branch === branch && t.month === month);
      if (found) Object.assign(found, clean);
      else s.targets.push({ branch, month, revenueTarget: 0, conversionTarget: 0, conversions: 0, ...clean });
    });
  }

  /** Copies the previous month's branch and employee targets (not conversion counts) into `month` where none are set. */
  copyFromPrevious(month: string): number {
    if (!this.access().canEdit) return 0;
    const [y, m] = month.split('-').map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    let copied = 0;
    this.mutate(s => {
      for (const t of s.targets.filter(x => x.month === prev)) {
        if (s.targets.some(x => x.branch === t.branch && x.month === month && x.revenueTarget)) continue;
        s.targets = s.targets.filter(x => !(x.branch === t.branch && x.month === month));
        s.targets.push({ ...t, month, conversions: 0 });
        copied++;
      }
      for (const t of s.employeeTargets.filter(x => x.month === prev)) {
        if (s.employeeTargets.some(x => x.employeeId === t.employeeId && x.month === month && Object.values(x.amounts).some(Boolean))) continue;
        s.employeeTargets = s.employeeTargets.filter(x => !(x.employeeId === t.employeeId && x.month === month));
        s.employeeTargets.push({ employeeId: t.employeeId, month, amounts: { ...t.amounts } });
        copied++;
      }
    });
    return copied;
  }

  setSlabs(slabs: IncentiveSlab[]): void {
    if (!this.access().canEdit) return;
    this.mutate(s => { s.rules.slabs = slabs.filter(x => x.minPercent >= 0 && x.ratePercent >= 0).sort((a, b) => a.minPercent - b.minPercent); });
  }

  setTelecallerRules(perConversion: number, conversionBonus: number): void {
    if (!this.access().canEdit) return;
    this.mutate(s => { s.rules.perConversion = Math.max(0, Number(perConversion) || 0); s.rules.conversionBonus = Math.max(0, Number(conversionBonus) || 0); });
  }

  // ---- Employee + treatment targets ----
  setEmployeeTarget(employeeId: string, month: string, category: TreatmentCategory, amount: number): void {
    if (!this.access().canEdit) return;
    const value = Math.max(0, Number(amount) || 0);
    this.mutate(s => {
      const found = s.employeeTargets.find(t => t.employeeId === employeeId && t.month === month);
      if (found) found.amounts[category] = value;
      else s.employeeTargets.push({ employeeId, month, amounts: { ...emptyAmounts(), [category]: value } });
    });
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
        employeeId: e.id, name: e.name, designation: e.designation, branch: e.branch, ...r,
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
        branch, revenueTarget: t.revenueTarget, achieved, percent, slabRate: rate, revenueIncentive,
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
}

function seedState(): TargetsState {
  const month = isoDate().slice(0, 7);
  const seeds: [string, number, number, number][] = [
    ['Anna Nagar', 150000, 40, 34],
    ['Velachery', 120000, 30, 31],
    ['T. Nagar', 100000, 25, 12],
    ['Adyar', 90000, 20, 18],
  ];
  // [employee id, hair, skin, slimming, combo] for the seeded HR staff who sell treatments.
  const staff: [string, number, number, number, number][] = [
    ['EMP-seed-2', 20000, 40000, 10000, 15000],
    ['EMP-seed-3', 40000, 10000, 10000, 20000],
    ['EMP-seed-4', 15000, 20000, 10000, 10000],
    ['EMP-seed-7', 20000, 15000, 15000, 15000],
    ['EMP-seed-9', 10000, 25000, 10000, 5000],
  ];
  return {
    targets: seeds.map(([branch, revenueTarget, conversionTarget, conversions]) => ({ branch, month, revenueTarget, conversionTarget, conversions })),
    employeeTargets: staff.map(([employeeId, Hair, Skin, Slimming, Combo]) => ({ employeeId, month, amounts: { Hair, Skin, Slimming, Combo } })),
    rules: structuredClone(DEFAULT_RULES),
  };
}
