/** Formatting + date helpers shared by the HR and Accounts modules. */

export const BRANCHES = ['Anna Nagar', 'Velachery', 'T. Nagar', 'Adyar'];
export const HEAD_OFFICE = 'Head Office';

export function inr(value: number): string {
  return `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function displayDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function displayTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Local calendar date as YYYY-MM-DD (not UTC, so late-evening entries stay on the right day). */
export function isoDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime();
  return Math.round(ms / 86400000);
}

/** YYYY-MM for the given date. */
export function monthKey(date = new Date()): string {
  return isoDate(date).slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function seqNo(prefix: string, count: number, year = new Date().getFullYear()): string {
  return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Indian-system amount in words, e.g. "One Lakh Twenty Thousand Rupees Only". */
export function amountInWords(value: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number): string => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim());
  const three = (n: number): string => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred ${two(n % 100)}` : two(n)).trim();

  let n = Math.round(Math.abs(value));
  if (!n) return 'Zero Rupees Only';
  const parts: string[] = [];
  for (const [size, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']] as const) {
    if (n >= size) {
      parts.push(`${three(Math.floor(n / size))} ${label}`);
      n %= size;
    }
  }
  if (n) parts.push(three(n));
  return `${parts.join(' ')} Rupees Only`;
}

/** Reads a persisted store snapshot, falling back to the seed when storage is empty/blocked/corrupt. */
export function loadState<T>(key: string, seed: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...seed(), ...(JSON.parse(raw) as T) };
  } catch { /* fall through to seed */ }
  return seed();
}

export function saveState(key: string, state: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch { /* storage full / blocked - state still works in memory */ }
}
