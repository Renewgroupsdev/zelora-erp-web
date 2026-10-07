/**
 * Branch targets & incentives:
 *  - Each branch gets a monthly revenue target (collection) and a telecaller conversion target.
 *  - Revenue achieved = collections posted to the branch in the month (same rule as the Day Book).
 *  - Branch incentive = achieved revenue x the rate of the highest slab reached by achievement %.
 *  - Telecaller incentive = conversions x per-conversion amount + a flat bonus once the conversion target is met.
 */

export interface BranchTarget {
  branch: string;
  /** YYYY-MM */
  month: string;
  revenueTarget: number;
  conversionTarget: number;
  /** Converted leads for the month (manual until the lead API feeds it). */
  conversions: number;
}

export interface IncentiveSlab {
  /** Achievement % needed to earn this slab. */
  minPercent: number;
  /** % of achieved revenue paid as incentive. */
  ratePercent: number;
}

export interface IncentiveRules {
  slabs: IncentiveSlab[];
  /** Rupees paid to the telecaller for every converted lead. */
  perConversion: number;
  /** Flat bonus once the conversion target is met. */
  conversionBonus: number;
}

export type TargetStatus = 'Not set' | 'Behind' | 'On track' | 'Achieved' | 'Exceeded';

export interface BranchPerformance {
  branch: string;
  revenueTarget: number;
  achieved: number;
  percent: number;
  slabRate: number;
  revenueIncentive: number;
  conversionTarget: number;
  conversions: number;
  conversionPercent: number;
  telecallerIncentive: number;
  totalIncentive: number;
  status: TargetStatus;
}

export const DEFAULT_RULES: IncentiveRules = {
  slabs: [
    { minPercent: 80, ratePercent: 1 },
    { minPercent: 100, ratePercent: 2 },
    { minPercent: 120, ratePercent: 3 },
  ],
  perConversion: 50,
  conversionBonus: 2000,
};

export function slabRate(percent: number, slabs: IncentiveSlab[]): number {
  return [...slabs].sort((a, b) => a.minPercent - b.minPercent).reduce((rate, s) => (percent >= s.minPercent ? s.ratePercent : rate), 0);
}

export function targetStatus(target: number, percent: number): TargetStatus {
  if (!target) return 'Not set';
  if (percent >= 120) return 'Exceeded';
  if (percent >= 100) return 'Achieved';
  return percent >= 60 ? 'On track' : 'Behind';
}

// ---------------------------------------------------------------------------
// Employee-wise, treatment-wise targets (Hair / Skin / Slimming / Combo)
// ---------------------------------------------------------------------------

export type TreatmentCategory = 'Hair' | 'Skin' | 'Slimming' | 'Combo';
export const TREATMENT_CATEGORIES: TreatmentCategory[] = ['Hair', 'Skin', 'Slimming', 'Combo'];

export const CATEGORY_ICONS: Record<TreatmentCategory, string> = {
  Hair: 'bi-scissors', Skin: 'bi-stars', Slimming: 'bi-activity', Combo: 'bi-layers-fill',
};

export interface EmployeeTarget {
  employeeId: string;
  /** YYYY-MM */
  month: string;
  amounts: Record<TreatmentCategory, number>;
}

export interface CategoryResult {
  target: number;
  achieved: number;
  percent: number;
}

export interface EmployeePerformance {
  employeeId: string;
  name: string;
  designation: string;
  branch: string;
  categories: Record<TreatmentCategory, CategoryResult>;
  target: number;
  achieved: number;
  percent: number;
  slabRate: number;
  incentive: number;
  status: TargetStatus;
}

export const emptyAmounts = (): Record<TreatmentCategory, number> => ({ Hair: 0, Skin: 0, Slimming: 0, Combo: 0 });

const KEYWORDS: Record<Exclude<TreatmentCategory, 'Combo'>, RegExp> = {
  Hair: /hair|prp|minoxidil|scalp|graft|transplant/i,
  Skin: /skin|facial|peel|laser|derma|acne|pigment|sunscreen|glow/i,
  Slimming: /slim|weight|inch|fat|contour|body/i,
};

/** Which treatment line an item belongs to (null for consultations and anything uncategorised). */
export function itemCategory(description: string): Exclude<TreatmentCategory, 'Combo'> | null {
  if (/consult/i.test(description)) return null;
  return (Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[]).find(k => KEYWORDS[k].test(description)) ?? null;
}

/** A bill's treatment category: one line -> that line; items from two or more lines (or a "combo") -> Combo. */
export function billCategory(items: { description: string }[]): TreatmentCategory | null {
  if (items.some(i => /combo/i.test(i.description))) return 'Combo';
  const lines = new Set(items.map(i => itemCategory(i.description)).filter((c): c is Exclude<TreatmentCategory, 'Combo'> => !!c));
  if (lines.size > 1) return 'Combo';
  return [...lines][0] ?? null;
}

/** Departments that sell / perform treatments; HR, Accounts and Tele Calling are measured differently. */
export function isTreatmentStaff(e: { department: string }): boolean {
  return !['HR', 'Accounts', 'Tele Calling', 'SEO'].includes(e.department);
}
