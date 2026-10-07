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
  /** Storefront photo (downscaled data URL) shown on the details page. */
  photo?: string;
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
  /** Stock value held at the partner outlet (reported by the franchise). */
  inventoryValue?: number;
  /** Storefront photo (downscaled data URL) shown on the details page. */
  photo?: string;
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

/** Last `count` months as YYYY-MM keys with short labels, oldest first. */
export function lastMonths(count = 7): { key: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-IN', { month: 'short' }) };
  });
}

/** "2 hours ago" style label for activity feeds. */
export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Reads an image file and downscales it to a JPEG data URL small enough for local storage. */
export function readPhoto(file: File, maxSize = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read the image.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Evenly spaced y-axis ticks from 0, rounded to a readable step (1 / 2 / 2.5 / 5 x 10^n). */
export function chartTicks(max: number, steps = 4): number[] {
  const raw = Math.max(1, max) / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

/** Axis label: 250000 -> "2.5L", 12000 -> "12K". */
export function axisShort(value: number): string {
  if (value >= 1e7) return `${+(value / 1e7).toFixed(1)}Cr`;
  if (value >= 1e5) return `${+(value / 1e5).toFixed(1)}L`;
  if (value >= 1e3) return `${+(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}
