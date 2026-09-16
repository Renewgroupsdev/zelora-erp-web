/**
 * Single source of truth for treatment pricing, combo packages and payment
 * methods, shared by the booking dialog (Schedule/Appointments), the
 * Appointments table/timeline, and CRM visit history - so a treatment's
 * price is never hand-typed differently in more than one place.
 */

export type PaymentStatus = 'Paid' | 'Partial' | 'Pending';

export type TreatmentCategory = 'Hair' | 'Skin' | 'Slimming';

export const TREATMENT_CATEGORIES: TreatmentCategory[] = ['Hair', 'Skin', 'Slimming'];

export interface Treatment {
  key: string;
  name: string;
  price: number;
  category: TreatmentCategory;
}

export interface ComboOffer {
  key: string;
  name: string;
  treatmentKeys: string[];
  price: number;
}

export const TREATMENTS: Treatment[] = [
  // Hair
  { key: 'hair-loss', name: 'Hair Loss Consultation', price: 1200, category: 'Hair' },
  { key: 'hair-spa', name: 'Hair Spa & PRP Therapy', price: 2800, category: 'Hair' },
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
  { key: 'complete-care', name: 'Complete Care (Hair Loss + Anti-Aging + Dermatology Review)', treatmentKeys: ['hair-loss', 'anti-aging', 'dermatology-review'], price: 5700 },
  { key: 'laser-glow', name: 'Laser Glow Combo (Laser Toning + Skin Rejuvenation)', treatmentKeys: ['laser-toning', 'skin-rejuvenation'], price: 5400 },
  { key: 'slim-fit', name: 'Slim Fit Combo (Inch Loss + Body Contouring)', treatmentKeys: ['inch-loss', 'body-contouring'], price: 8800 },
];

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
