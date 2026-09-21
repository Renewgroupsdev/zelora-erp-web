/**
 * Single source of truth for treatment pricing, combo packages and payment
 * methods, shared by the booking dialog (Schedule/Appointments), the
 * Appointments table/timeline, and CRM visit history - so a treatment's
 * price is never hand-typed differently in more than one place.
 */

export type PaymentStatus = 'Paid' | 'Partial' | 'Pending';

export type TreatmentCategory = 'Hair' | 'Skin' | 'Slimming';

export const TREATMENT_CATEGORIES: TreatmentCategory[] = ['Hair', 'Skin', 'Slimming'];

export interface TreatmentMaterial {
  key: string;
  name: string;
  unit: string;
  quantity: number;
}

export type DiscountType = 'percentage' | 'fixed';

export interface Treatment {
  key: string;
  name: string;
  price: number;
  category: TreatmentCategory;
  gender?: 'M' | 'F' | 'All';
  description?: string;
  discount?: number;
  discountType?: DiscountType;
  gstRate?: number;
  maxSessions?: number;
  isCombo?: boolean;
  treatmentKeys?: string[];
  materials?: TreatmentMaterial[];
}

export interface ComboOffer {
  key: string;
  name: string;
  treatmentKeys: string[];
  price: number;
  discount?: number;
  discountType?: DiscountType;
  gstRate?: number;
  maxSessions?: number;
  materials?: TreatmentMaterial[];
}

/** Clinical baldness classification picked during a Hair-category consult, alongside the treatment itself. */
export interface BaldnessType {
  key: string;
  label: string;
  gender: 'M' | 'F';
}

/** Norwood-Hamilton scale (male pattern baldness) - 6 stages. */
export const MALE_BALDNESS_TYPES: BaldnessType[] = [
  { key: 'norwood-1', label: 'Norwood Type I - Minimal recession', gender: 'M' },
  { key: 'norwood-2', label: 'Norwood Type II - Temporal recession', gender: 'M' },
  { key: 'norwood-3', label: 'Norwood Type III - Frontal baldness', gender: 'M' },
  { key: 'norwood-4', label: 'Norwood Type IV - Advanced frontal & vertex thinning', gender: 'M' },
  { key: 'norwood-5', label: 'Norwood Type V - Extensive vertex balding', gender: 'M' },
  { key: 'norwood-6', label: 'Norwood Type VI - Sparse bridge of hair', gender: 'M' },
];

/** Ludwig scale (female pattern hair loss) - 3 stages. */
export const FEMALE_BALDNESS_TYPES: BaldnessType[] = [
  { key: 'ludwig-1', label: 'Ludwig Stage I - Mild diffuse thinning', gender: 'F' },
  { key: 'ludwig-2', label: 'Ludwig Stage II - Moderate diffuse thinning', gender: 'F' },
  { key: 'ludwig-3', label: 'Ludwig Stage III - Extensive diffuse thinning', gender: 'F' },
];

export function baldnessTypesFor(gender: string): BaldnessType[] {
  if (gender === 'M') return MALE_BALDNESS_TYPES;
  if (gender === 'F') return FEMALE_BALDNESS_TYPES;
  return [];
}

/** A treatment or product bundle a doctor can suggest, on top of (or instead of) picking individual treatments. */
export interface TreatmentPackage {
  key: string;
  name: string;
  category: TreatmentCategory;
  type: 'Treatment' | 'Product';
  price: number;
  description: string;
  discount?: number;
  discountType?: DiscountType;
  gstRate?: number;
  maxSessions?: number;
  treatmentKeys?: string[];
  materials?: TreatmentMaterial[];
}

export const TREATMENTS: Treatment[] = [
  // Hair
  { key: 'male-androgenetic-alopecia', name: 'Male Pattern Baldness (Androgenetic)', price: 1200, category: 'Hair', gender: 'M' },
  { key: 'male-receding-hairline', name: 'Receding Hairline', price: 1400, category: 'Hair', gender: 'M' },
  { key: 'male-crown-thinning', name: 'Crown Thinning', price: 1400, category: 'Hair', gender: 'M' },
  { key: 'male-diffuse-thinning', name: 'Diffuse Thinning', price: 1600, category: 'Hair', gender: 'M' },
  { key: 'male-alopecia-areata', name: 'Alopecia Areata', price: 1800, category: 'Hair', gender: 'M' },
  { key: 'male-hair-transplant', name: 'Hair Transplant Assessment', price: 2200, category: 'Hair', gender: 'M' },
  { key: 'female-pattern-hair-loss', name: 'Female Pattern Hair Loss', price: 1200, category: 'Hair', gender: 'F' },
  { key: 'female-postpartum-hair-loss', name: 'Postpartum Hair Loss', price: 1400, category: 'Hair', gender: 'F' },
  { key: 'female-traction-alopecia', name: 'Traction Alopecia', price: 1600, category: 'Hair', gender: 'F' },
  { key: 'hair-spa', name: 'Hair Spa & PRP Therapy', price: 2800, category: 'Hair', gender: 'All' },
  // Skin
  { key: 'skin-rejuvenation', name: 'Skin Rejuvenation', price: 2500, category: 'Skin' },
  { key: 'laser-toning', name: 'Laser Toning', price: 3500, category: 'Skin' },
  { key: 'acne-treatment', name: 'Acne Treatment', price: 1800, category: 'Skin' },
  { key: 'anti-aging', name: 'Anti-Aging Therapy', price: 4200, category: 'Skin' },
  { key: 'bridal-package', name: 'Bridal Package', price: 15000, category: 'Skin' },
  { key: 'dermatology-review', name: 'Dermatology Review', price: 900, category: 'Skin' },
  // Slimming
  { key: 'inch-loss', name: 'Inch Loss Therapy', price: 3200, category: 'Slimming' },
  { key: 'body-contouring', name: 'Body Contouring', price: 6500, category: 'Slimming' },
  { key: 'fat-freeze', name: 'Fat Freeze Therapy', price: 8500, category: 'Slimming' },
];

export const COMBO_OFFERS: ComboOffer[] = [
  { key: 'glow-combo', name: 'Glow Combo (Skin Rejuvenation + Acne Treatment)', treatmentKeys: ['skin-rejuvenation', 'acne-treatment'], price: 3800 },
  { key: 'complete-care', name: 'Complete Care (Hair Spa + Anti-Aging + Dermatology Review)', treatmentKeys: ['hair-spa', 'anti-aging', 'dermatology-review'], price: 5700 },
  { key: 'laser-glow', name: 'Laser Glow Combo (Laser Toning + Skin Rejuvenation)', treatmentKeys: ['laser-toning', 'skin-rejuvenation'], price: 5400 },
  { key: 'slim-fit', name: 'Slim Fit Combo (Inch Loss + Body Contouring)', treatmentKeys: ['inch-loss', 'body-contouring'], price: 8800 },
];

export const PACKAGES: TreatmentPackage[] = [
  { key: 'hair-regrowth-therapy-pkg', name: 'Hair Regrowth Therapy Package (6 sessions)', category: 'Hair', type: 'Treatment', price: 24000, description: 'PRP + laser therapy sessions for regrowth' },
  { key: 'hair-care-product-kit', name: 'Hair Care Product Kit', category: 'Hair', type: 'Product', price: 3200, description: 'Anti-hairfall shampoo, serum & supplements' },
  { key: 'skin-glow-treatment-pkg', name: 'Skin Glow Treatment Package (4 sessions)', category: 'Skin', type: 'Treatment', price: 12000, description: 'Rejuvenation + laser toning sessions' },
  { key: 'skin-care-product-kit', name: 'Skin Care Product Kit', category: 'Skin', type: 'Product', price: 2800, description: 'Cleanser, sunscreen & serum kit' },
  { key: 'body-slimming-treatment-pkg', name: 'Body Slimming Treatment Package (6 sessions)', category: 'Slimming', type: 'Treatment', price: 28000, description: 'Inch loss + body contouring sessions' },
  { key: 'slimming-nutrition-kit', name: 'Slimming Nutrition Kit', category: 'Slimming', type: 'Product', price: 4500, description: 'Meal plan & supplement kit' },
];

export function packagesByCategory(category: TreatmentCategory): TreatmentPackage[] {
  return PACKAGES.filter((p) => p.category === category);
}

export function packageByKey(key: string): TreatmentPackage | undefined {
  return PACKAGES.find((p) => p.key === key);
}

export const PAYMENT_METHODS = ['Cash', 'Card', 'UPI', 'Net Banking'];

export function treatmentByKey(key: string): Treatment | undefined {
  return TREATMENTS.find((t) => t.key === key);
}

export function treatmentByName(name: string): Treatment | undefined {
  return TREATMENTS.find((t) => t.name === name);
}

export function treatmentsByCategory(category: TreatmentCategory): Treatment[] {
  return TREATMENTS.filter((t) => t.category === category);
}

export function formatCurrency(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}
