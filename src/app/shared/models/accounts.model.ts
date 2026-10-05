/**
 * Accounts - Tally-style double entry:
 *  - Ledgers sit under groups (Cash-in-Hand, Bank Accounts, Sundry Debtors, Sales Accounts...).
 *  - Every voucher (Sales, Purchase, Receipt, Payment, Contra, Journal, Credit Note, Debit Note) posts
 *    equal debits and credits to ledgers.
 *  - Service bills post a Sales voucher; collections post Receipt vouchers; proforma bills post nothing.
 *  - Day Book: opening cash + bank, total collection, payments, closing. Closing = next day's opening.
 */

export type LedgerGroup =
  | 'Cash-in-Hand'
  | 'Bank Accounts'
  | 'Sundry Debtors'
  | 'Sundry Creditors'
  | 'Sales Accounts'
  | 'Purchase Accounts'
  | 'Direct Expenses'
  | 'Indirect Expenses'
  | 'Indirect Incomes'
  | 'Duties & Taxes'
  | 'Capital Account';

export const LEDGER_GROUPS: LedgerGroup[] = [
  'Cash-in-Hand', 'Bank Accounts', 'Sundry Debtors', 'Sundry Creditors', 'Sales Accounts', 'Purchase Accounts',
  'Direct Expenses', 'Indirect Expenses', 'Indirect Incomes', 'Duties & Taxes', 'Capital Account',
];

/** Groups that make up the "cash position" shown in the Day Book. */
export const CASH_GROUPS: LedgerGroup[] = ['Cash-in-Hand', 'Bank Accounts'];
export const INCOME_GROUPS: LedgerGroup[] = ['Sales Accounts', 'Indirect Incomes'];
export const EXPENSE_GROUPS: LedgerGroup[] = ['Purchase Accounts', 'Direct Expenses', 'Indirect Expenses'];

export interface Ledger {
  id: string;
  name: string;
  group: LedgerGroup;
  /** Signed: positive = Dr, negative = Cr. */
  openingBalance: number;
  phone?: string;
  gstin?: string;
  address?: string;
  /** System ledgers (cash, sales, GST...) can't be deleted or renamed. */
  system?: boolean;
}

export type VoucherType = 'Sales' | 'Purchase' | 'Receipt' | 'Payment' | 'Contra' | 'Journal' | 'Credit Note' | 'Debit Note';
export const VOUCHER_TYPES: VoucherType[] = ['Sales', 'Purchase', 'Receipt', 'Payment', 'Contra', 'Journal', 'Credit Note', 'Debit Note'];

/** Tally function keys, shown on the voucher type picker. */
export const VOUCHER_KEYS: Record<VoucherType, string> = {
  Contra: 'F4', Payment: 'F5', Receipt: 'F6', Journal: 'F7', Sales: 'F8', Purchase: 'F9', 'Credit Note': 'Ctrl+F8', 'Debit Note': 'Ctrl+F9',
};

export const VOUCHER_PREFIX: Record<VoucherType, string> = {
  Sales: 'SAL', Purchase: 'PUR', Receipt: 'RCT', Payment: 'PMT', Contra: 'CTR', Journal: 'JRN', 'Credit Note': 'CN', 'Debit Note': 'DN',
};

export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque';
export const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque'];

export interface VoucherEntry {
  ledgerId: string;
  debit: number;
  credit: number;
}

export interface Voucher {
  id: string;
  voucherNo: string;
  type: VoucherType;
  date: string;
  entries: VoucherEntry[];
  narration: string;
  mode?: PaymentMode;
  /** Bill no / invoice no this voucher belongs to. */
  reference?: string;
  billId?: string;
  branch: string;
  createdBy: string;
  createdAt: string;
  cancelled?: boolean;
}

export type BillKind = 'Proforma' | 'Service';
export type ProformaStatus = 'Draft' | 'Sent' | 'Converted' | 'Cancelled';
export type ServiceBillStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Cancelled';

export interface BillItem {
  description: string;
  /** SAC for services / HSN for products. */
  sac: string;
  qty: number;
  rate: number;
  discountPercent: number;
  gstPercent: number;
}

export interface Bill {
  id: string;
  billNo: string;
  kind: BillKind;
  date: string;
  /** Proforma: quote valid till. Service: payment due date. */
  dueDate: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerGstin: string;
  partyLedgerId?: string;
  branch: string;
  items: BillItem[];
  notes: string;
  status: ProformaStatus | ServiceBillStatus;
  paidAmount: number;
  convertedFromId?: string;
  convertedToId?: string;
  salesVoucherId?: string;
  createdBy: string;
  createdAt: string;
}

export interface DayClose {
  date: string;
  opening: number;
  receipts: number;
  payments: number;
  closing: number;
  cashClosing: number;
  bankClosing: number;
  closedBy: string;
  closedAt: string;
}

export interface BillTotals {
  gross: number;
  discount: number;
  taxable: number;
  gst: number;
  total: number;
  /** Rounded to the rupee, as printed. */
  roundOff: number;
  grandTotal: number;
}

export function lineAmount(i: BillItem): { gross: number; discount: number; taxable: number; gst: number; total: number } {
  const gross = i.qty * i.rate;
  const discount = (gross * (i.discountPercent || 0)) / 100;
  const taxable = gross - discount;
  const gst = (taxable * (i.gstPercent || 0)) / 100;
  return { gross, discount, taxable, gst, total: taxable + gst };
}

export function billTotals(items: BillItem[]): BillTotals {
  const sum = items.map(lineAmount).reduce(
    (t, l) => ({ gross: t.gross + l.gross, discount: t.discount + l.discount, taxable: t.taxable + l.taxable, gst: t.gst + l.gst, total: t.total + l.total }),
    { gross: 0, discount: 0, taxable: 0, gst: 0, total: 0 },
  );
  const grandTotal = Math.round(sum.total);
  return { ...sum, roundOff: grandTotal - sum.total, grandTotal };
}

/** Tally-style "12,500.00 Dr" / "3,000.00 Cr". */
export function drCr(signed: number): string {
  const abs = Math.abs(signed);
  if (abs < 0.005) return '0.00';
  return `${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${signed >= 0 ? 'Dr' : 'Cr'}`;
}

export function voucherAmount(v: Pick<Voucher, 'entries'>): number {
  return v.entries.reduce((s, e) => s + e.debit, 0);
}
