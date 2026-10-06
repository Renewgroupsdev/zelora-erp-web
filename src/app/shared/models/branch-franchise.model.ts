/**
 * Branch Management (company-owned branches) and Franchise Management (partner outlets).
 * A franchise invoice is split between the franchise partner and Renew (default 70 / 30).
 */

export type BranchStatus = 'Active' | 'Inactive';

export interface BranchRecord {
  id: string;
  /** e.g. BR01 */
  code: string;
  name: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  address: string;
  headName: string;
  headPhone: string;
  headEmail: string;
  status: BranchStatus;
  openedOn: string;
}

export type FranchiseStatus = 'Active' | 'Pending' | 'Inactive';

export interface FranchiseRecord {
  id: string;
  /** e.g. FR02 */
  code: string;
  /** Outlet name, usually the city. */
  name: string;
  /** Registered owner company, e.g. XYZ Enterprises. */
  ownerCompany: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  city: string;
  state: string;
  gstin: string;
  status: FranchiseStatus;
  agreementFrom: string;
  agreementTo: string;
  /** Franchise partner's share of every invoice; Renew keeps the rest. */
  sharePercent: number;
  shareEffectiveFrom: string;
  employees: number;
}

export interface FranchiseInvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface FranchiseInvoice {
  id: string;
  invoiceNo: string;
  franchiseId: string;
  date: string;
  customer: string;
  status: 'Paid' | 'Unpaid';
  items: FranchiseInvoiceItem[];
  notes: string;
}

export interface ShareSplit {
  total: number;
  franchise: number;
  renew: number;
}

export function invoiceTotal(items: FranchiseInvoiceItem[]): number {
  return items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
}

export function splitShare(total: number, sharePercent: number): ShareSplit {
  const franchise = Math.round((total * sharePercent) / 100 * 100) / 100;
  return { total, franchise, renew: Math.round((total - franchise) * 100) / 100 };
}

/** Compact lakh/crore style used on dashboards, e.g. 1845000 -> "₹18.45 L". */
export function inrShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}
