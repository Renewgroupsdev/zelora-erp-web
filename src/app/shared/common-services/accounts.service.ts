import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import {
  Bill,
  BillItem,
  CASH_GROUPS,
  DayClose,
  EXPENSE_GROUPS,
  INCOME_GROUPS,
  Ledger,
  LedgerGroup,
  PaymentMode,
  VOUCHER_PREFIX,
  Voucher,
  VoucherEntry,
  VoucherType,
  billTotals,
  voucherAmount,
} from '../models/accounts.model';
import { BRANCHES, addDays, isoDate, loadState, saveState, uid } from '../utils/format.util';
import { NotificationService } from './notification.service';

const STORAGE_KEY = 'zelora_accounts_store_v1';

interface AccountsState {
  ledgers: Ledger[];
  vouchers: Voucher[];
  bills: Bill[];
  dayCloses: DayClose[];
}

/** Fixed system ledgers the posting rules rely on. */
export const LEDGER = {
  cash: 'L-CASH',
  bank: 'L-HDFC',
  serviceIncome: 'L-SERV',
  productSales: 'L-PROD',
  outputCgst: 'L-CGST',
  outputSgst: 'L-SGST',
  inputCgst: 'L-ICGST',
  inputSgst: 'L-ISGST',
  purchase: 'L-PURCH',
  capital: 'L-CAP',
} as const;

export interface DayBookSummary {
  date: string;
  opening: number;
  receipts: number;
  payments: number;
  closing: number;
  cashClosing: number;
  bankClosing: number;
  byMode: Record<string, number>;
  byBranch: Record<string, number>;
  vouchers: Voucher[];
  closed: DayClose | undefined;
}

export interface NewBillInput {
  kind: Bill['kind'];
  date: string;
  dueDate: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerGstin: string;
  branch: string;
  employeeId?: string;
  items: BillItem[];
  notes: string;
}

export interface NewVoucherInput {
  type: VoucherType;
  date: string;
  entries: VoucherEntry[];
  narration: string;
  mode?: PaymentMode;
  reference?: string;
  branch: string;
}

/**
 * Front-end store for Accounts (design stage - no API yet). State lives in signals and is mirrored to
 * localStorage; the posting functions below are what the backend must reproduce.
 */
@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly state = signal<AccountsState>(attributeSeedBills(loadState(STORAGE_KEY, seedState)));

  readonly ledgers = computed(() => this.state().ledgers);
  readonly vouchers = computed(() => this.state().vouchers.filter(v => !v.cancelled));
  readonly bills = computed(() => this.state().bills);
  readonly dayCloses = computed(() => this.state().dayCloses);
  readonly branches = BRANCHES;

  readonly cashLedgers = computed(() => this.ledgers().filter(l => CASH_GROUPS.includes(l.group)));
  readonly receivables = computed(() => this.bills()
    .filter(b => b.kind === 'Service' && (b.status === 'Unpaid' || b.status === 'Partially Paid'))
    .reduce((s, b) => s + billTotals(b.items).grandTotal - b.paidAmount, 0));

  constructor() {
    effect(() => saveState(STORAGE_KEY, this.state()));
  }

  get userName(): string {
    return this.auth.currentUser()?.name || 'Accountant';
  }

  ledger(id: string): Ledger | undefined {
    return this.ledgers().find(l => l.id === id);
  }

  ledgerName(id: string): string {
    return this.ledger(id)?.name ?? 'Unknown ledger';
  }

  ledgersIn(groups: LedgerGroup[]): Ledger[] {
    return this.ledgers().filter(l => groups.includes(l.group));
  }

  // ---- Balances ----
  /** Signed balance (+Dr / -Cr) including vouchers dated on/before `upto` (all when omitted). */
  balance(ledgerId: string, upto?: string, before = false): number {
    const l = this.ledger(ledgerId);
    if (!l) return 0;
    return this.vouchers()
      .filter(v => !upto || (before ? v.date < upto : v.date <= upto))
      .reduce((sum, v) => sum + v.entries.filter(e => e.ledgerId === ledgerId).reduce((s, e) => s + e.debit - e.credit, 0), l.openingBalance);
  }

  ledgerTotals(ledgerId: string, from?: string, to?: string): { opening: number; debit: number; credit: number; closing: number } {
    const opening = from ? this.balance(ledgerId, from, true) : (this.ledger(ledgerId)?.openingBalance ?? 0);
    let debit = 0;
    let credit = 0;
    for (const v of this.vouchers()) {
      if ((from && v.date < from) || (to && v.date > to)) continue;
      for (const e of v.entries) if (e.ledgerId === ledgerId) { debit += e.debit; credit += e.credit; }
    }
    return { opening, debit, credit, closing: opening + debit - credit };
  }

  /** Statement lines with running balance. */
  ledgerStatement(ledgerId: string, from: string, to: string) {
    let running = this.balance(ledgerId, from, true);
    const opening = running;
    const lines = this.vouchers()
      .filter(v => v.date >= from && v.date <= to && v.entries.some(e => e.ledgerId === ledgerId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
      .map(v => {
        const own = v.entries.filter(e => e.ledgerId === ledgerId);
        const debit = own.reduce((s, e) => s + e.debit, 0);
        const credit = own.reduce((s, e) => s + e.credit, 0);
        running += debit - credit;
        // "Particulars" = the other side of the entry, as Tally shows it.
        const others = v.entries.filter(e => e.ledgerId !== ledgerId && (debit ? e.credit : e.debit));
        return { voucher: v, particulars: others.map(e => this.ledgerName(e.ledgerId)).join(', ') || '-', debit, credit, balance: running };
      });
    return { opening, lines, closing: running };
  }

  // ---- Day Book ----
  dayBook(date: string): DayBookSummary {
    const cashIds = new Set(this.cashLedgers().map(l => l.id));
    const position = (upto: string, before: boolean) => [...cashIds].reduce((s, id) => s + this.balance(id, upto, before), 0);
    // Opening = the frozen closing of the latest closed day before this one, plus any cash movement since that close.
    // With no closed day before it, fall back to the ledger position.
    const lastClose = this.dayCloses().filter(c => c.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
    const opening = lastClose
      ? round2(lastClose.closing + this.vouchers()
        .filter(v => v.date > lastClose.date && v.date < date)
        .reduce((s, v) => s + v.entries.filter(e => cashIds.has(e.ledgerId)).reduce((x, e) => x + e.debit - e.credit, 0), 0))
      : position(date, true);
    const vouchers = this.vouchers().filter(v => v.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    let receipts = 0;
    let payments = 0;
    const byMode: Record<string, number> = {};
    const byBranch: Record<string, number> = {};
    for (const v of vouchers) {
      if (v.type === 'Contra') continue; // cash <-> bank moves don't change the cash position
      const inflow = v.entries.filter(e => cashIds.has(e.ledgerId)).reduce((s, e) => s + e.debit, 0);
      const outflow = v.entries.filter(e => cashIds.has(e.ledgerId)).reduce((s, e) => s + e.credit, 0);
      receipts += inflow;
      payments += outflow;
      if (inflow) {
        byMode[v.mode ?? 'Cash'] = (byMode[v.mode ?? 'Cash'] ?? 0) + inflow;
        byBranch[v.branch] = (byBranch[v.branch] ?? 0) + inflow;
      }
    }

    const closing = round2(opening + receipts - payments);
    const bankClosing = [...cashIds].filter(id => id !== LEDGER.cash).reduce((s, id) => s + this.balance(id, date), 0);
    return {
      date, opening, receipts, payments, closing,
      // Cash is the remainder so cash + bank always equals the carried-forward closing.
      cashClosing: round2(closing - bankClosing),
      bankClosing,
      byMode, byBranch, vouchers,
      closed: this.dayCloses().find(d => d.date === date),
    };
  }

  isClosed(date: string): boolean {
    return this.dayCloses().some(d => d.date === date);
  }

  /** Locks the day; its closing balance is the next day's opening balance. */
  closeDay(date: string): DayClose | null {
    if (this.isClosed(date) || date > isoDate()) return null;
    const b = this.dayBook(date);
    const close: DayClose = {
      date, opening: b.opening, receipts: b.receipts, payments: b.payments, closing: b.closing,
      cashClosing: b.cashClosing, bankClosing: b.bankClosing, closedBy: this.userName, closedAt: new Date().toISOString(),
    };
    this.mutate(s => s.dayCloses.push(close));
    this.notifications.add({ type: 'accounts', title: `Day closed · ${date}`, message: `Collection ₹${b.receipts.toLocaleString('en-IN')} · closing ₹${b.closing.toLocaleString('en-IN')} carried to ${addDays(date, 1)}.`, link: '/app/accounts/day-book' });
    return close;
  }

  reopenDay(date: string): void {
    this.mutate(s => { s.dayCloses = s.dayCloses.filter(d => d.date !== date); });
  }

  // ---- Ledgers ----
  addLedger(input: Omit<Ledger, 'id'>): Ledger | string {
    if (this.ledgers().some(l => l.name.trim().toLowerCase() === input.name.trim().toLowerCase())) return 'A ledger with this name already exists.';
    const ledger: Ledger = { ...input, name: input.name.trim(), id: uid('L') };
    this.mutate(s => s.ledgers.push(ledger));
    return ledger;
  }

  updateLedger(id: string, patch: Partial<Ledger>): void {
    this.mutate(s => { s.ledgers = s.ledgers.map(l => (l.id === id ? { ...l, ...patch } : l)); });
  }

  // ---- Vouchers ----
  /** Returns the voucher, or an error message when it can't be posted. */
  postVoucher(input: NewVoucherInput): Voucher | string {
    const error = validateVoucher(input, this.isClosed(input.date));
    if (error) return error;
    let voucher!: Voucher;
    this.mutate(s => { voucher = addVoucher(s, input, this.userName); });
    return voucher;
  }

  // ---- Bills ----
  createBill(input: NewBillInput, collect: { amount: number; mode: PaymentMode } | null): Bill | string {
    if (input.kind === 'Service' && this.isClosed(input.date)) return `${input.date} is closed in the Day Book - reopen it or bill today.`;
    let bill!: Bill;
    this.mutate(s => {
      bill = addBill(s, input, this.userName);
      if (bill.kind === 'Service' && collect?.amount) addReceipt(s, bill, collect.amount, collect.mode, bill.date, this.userName);
    });
    return bill;
  }

  convertProforma(id: string, date = isoDate()): Bill | string {
    const p = this.bills().find(b => b.id === id);
    if (!p || p.kind !== 'Proforma' || p.status === 'Converted' || p.status === 'Cancelled') return 'Only an open proforma can be converted.';
    if (this.isClosed(date)) return `${date} is closed in the Day Book.`;
    let bill!: Bill;
    this.mutate(s => {
      bill = addBill(s, { ...p, kind: 'Service', date, dueDate: addDays(date, 7), notes: `${p.notes ? p.notes + ' · ' : ''}Against proforma ${p.billNo}` }, this.userName);
      bill.convertedFromId = p.id;
      const draft = s.bills.find(b => b.id === p.id)!;
      draft.status = 'Converted';
      draft.convertedToId = bill.id;
    });
    return bill;
  }

  markProformaSent(id: string): void {
    this.mutate(s => { const b = s.bills.find(x => x.id === id); if (b && b.status === 'Draft') b.status = 'Sent'; });
  }

  collectPayment(billId: string, amount: number, mode: PaymentMode, date = isoDate()): Voucher | string {
    const bill = this.bills().find(b => b.id === billId);
    if (!bill || bill.kind !== 'Service') return 'Bill not found.';
    const due = billTotals(bill.items).grandTotal - bill.paidAmount;
    if (amount <= 0 || amount > due + 0.01) return `Amount must be between ₹1 and ₹${due.toLocaleString('en-IN')}.`;
    if (this.isClosed(date)) return `${date} is closed in the Day Book.`;
    let v!: Voucher;
    this.mutate(s => { v = addReceipt(s, s.bills.find(b => b.id === billId)!, amount, mode, date, this.userName); });
    return v;
  }

  /** Proforma: just cancelled. Unpaid service bill: reversed with a Credit Note (sales return). */
  cancelBill(id: string, reason: string): Voucher | string | null {
    const bill = this.bills().find(b => b.id === id);
    if (!bill) return 'Bill not found.';
    if (bill.kind === 'Proforma') {
      this.mutate(s => { s.bills.find(b => b.id === id)!.status = 'Cancelled'; });
      return null;
    }
    if (bill.paidAmount > 0) return 'This bill has collections - refund them with a Payment voucher first.';
    const date = isoDate();
    if (this.isClosed(date)) return `${date} is closed in the Day Book.`;
    let note!: Voucher;
    this.mutate(s => { note = reverseBill(s, s.bills.find(b => b.id === id)!, date, reason, this.userName); });
    return note;
  }

  // ---- Reports ----
  trialBalance(upto = isoDate()) {
    return this.ledgers()
      .map(l => ({ ledger: l, balance: this.balance(l.id, upto) }))
      .filter(r => Math.abs(r.balance) > 0.004);
  }

  profitAndLoss(from: string, to: string) {
    const sumGroups = (groups: LedgerGroup[], sign: 1 | -1) => this.ledgersIn(groups)
      .map(l => {
        const t = this.ledgerTotals(l.id, from, to);
        return { ledger: l, amount: sign * (t.debit - t.credit) };
      })
      .filter(r => Math.abs(r.amount) > 0.004);
    const income = sumGroups(INCOME_GROUPS, -1);
    const expenses = sumGroups(EXPENSE_GROUPS, 1);
    const totalIncome = income.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
    return { income, expenses, totalIncome, totalExpense, net: totalIncome - totalExpense };
  }

  voucherAmount = voucherAmount;

  private mutate(fn: (draft: AccountsState) => void): void {
    const draft = structuredClone(this.state());
    fn(draft);
    this.state.set(draft);
  }
}

// ---------------------------------------------------------------------------
// Posting rules (pure - shared by the live service and the seed)
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Indian financial year label for a date, e.g. 2026-10-02 -> "26-27". */
export function fyLabel(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

function nextNo(prefix: string, existing: string[], date: string): string {
  const fy = fyLabel(date);
  const head = `${prefix}/${fy}/`;
  const max = existing.filter(n => n.startsWith(head)).reduce((m, n) => Math.max(m, Number(n.slice(head.length)) || 0), 0);
  return `${head}${String(max + 1).padStart(4, '0')}`;
}

export function validateVoucher(input: NewVoucherInput, dayClosed: boolean): string | null {
  if (dayClosed) return `${input.date} is closed in the Day Book - reopen the day to post into it.`;
  const lines = input.entries.filter(e => e.debit || e.credit);
  if (lines.length < 2) return 'A voucher needs at least one debit and one credit line.';
  if (lines.some(e => !e.ledgerId)) return 'Select a ledger on every line.';
  if (lines.some(e => e.debit < 0 || e.credit < 0)) return 'Amounts cannot be negative.';
  const dr = round2(lines.reduce((s, e) => s + e.debit, 0));
  const cr = round2(lines.reduce((s, e) => s + e.credit, 0));
  if (!dr) return 'Enter an amount.';
  if (dr !== cr) return `Debit (₹${dr.toLocaleString('en-IN')}) and credit (₹${cr.toLocaleString('en-IN')}) must match.`;
  return null;
}

function addVoucher(s: AccountsState, input: NewVoucherInput, by: string): Voucher {
  const v: Voucher = {
    ...input,
    entries: input.entries.filter(e => e.debit || e.credit).map(e => ({ ledgerId: e.ledgerId, debit: round2(e.debit), credit: round2(e.credit) })),
    id: uid('V'),
    voucherNo: nextNo(VOUCHER_PREFIX[input.type], s.vouchers.filter(x => x.type === input.type).map(x => x.voucherNo), input.date),
    createdBy: by,
    createdAt: new Date(`${input.date}T${new Date().toTimeString().slice(0, 8)}`).toISOString(),
  };
  s.vouchers.push(v);
  return v;
}

/** Finds the customer's Sundry Debtors ledger (by name + phone), creating it on first bill - like Tally party ledgers. */
function ensureParty(s: AccountsState, name: string, phone: string, address: string, gstin: string): Ledger {
  const key = name.trim().toLowerCase();
  const found = s.ledgers.find(l => l.group === 'Sundry Debtors' && l.name.toLowerCase() === key && (!phone || !l.phone || l.phone === phone));
  if (found) return found;
  const ledger: Ledger = { id: uid('L'), name: name.trim(), group: 'Sundry Debtors', openingBalance: 0, phone, address, gstin };
  s.ledgers.push(ledger);
  return ledger;
}

function addBill(s: AccountsState, input: NewBillInput, by: string): Bill {
  const bill: Bill = {
    ...input,
    items: input.items.map(i => ({ ...i })),
    id: uid('B'),
    billNo: nextNo(input.kind === 'Proforma' ? 'PF' : 'SB', s.bills.filter(b => b.kind === input.kind).map(b => b.billNo), input.date),
    status: input.kind === 'Proforma' ? 'Draft' : 'Unpaid',
    paidAmount: 0,
    createdBy: by,
    createdAt: new Date().toISOString(),
  };

  if (bill.kind === 'Service') {
    // Sales voucher: Dr customer (grand total) / Cr income (taxable + round off) / Cr output CGST + SGST.
    const party = ensureParty(s, bill.customerName, bill.customerPhone, bill.customerAddress, bill.customerGstin);
    const t = billTotals(bill.items);
    const services = bill.items.filter(i => i.sac.startsWith('99'));
    const serviceTaxable = billTotals(services).taxable;
    const productTaxable = t.taxable - serviceTaxable;
    const cgst = round2(t.gst / 2);
    const entries: VoucherEntry[] = [
      { ledgerId: party.id, debit: t.grandTotal, credit: 0 },
      { ledgerId: LEDGER.serviceIncome, debit: 0, credit: round2(serviceTaxable + (productTaxable ? 0 : t.roundOff)) },
      { ledgerId: LEDGER.productSales, debit: 0, credit: round2(productTaxable + (productTaxable ? t.roundOff : 0)) },
      { ledgerId: LEDGER.outputCgst, debit: 0, credit: cgst },
      { ledgerId: LEDGER.outputSgst, debit: 0, credit: round2(t.gst - cgst) },
    ];
    // Fix any paisa drift from rounding so the voucher always balances.
    const drift = round2(entries.reduce((x, e) => x + e.debit - e.credit, 0));
    if (drift) entries[productTaxable ? 2 : 1].credit = round2(entries[productTaxable ? 2 : 1].credit + drift);

    const v = addVoucher(s, { type: 'Sales', date: bill.date, branch: bill.branch, reference: bill.billNo, narration: `Service bill ${bill.billNo} · ${bill.customerName}`, entries }, by);
    v.billId = bill.id;
    bill.partyLedgerId = party.id;
    bill.salesVoucherId = v.id;
  }

  s.bills.push(bill);
  return bill;
}

function addReceipt(s: AccountsState, bill: Bill, amount: number, mode: PaymentMode, date: string, by: string): Voucher {
  const v = addVoucher(s, {
    type: 'Receipt', date, mode, branch: bill.branch, reference: bill.billNo,
    narration: `Received from ${bill.customerName} against ${bill.billNo} (${mode})`,
    entries: [
      { ledgerId: mode === 'Cash' ? LEDGER.cash : LEDGER.bank, debit: amount, credit: 0 },
      { ledgerId: bill.partyLedgerId!, debit: 0, credit: amount },
    ],
  }, by);
  v.billId = bill.id;
  bill.paidAmount = round2(bill.paidAmount + amount);
  bill.status = bill.paidAmount >= billTotals(bill.items).grandTotal - 0.01 ? 'Paid' : 'Partially Paid';
  return v;
}

/** Credit Note that mirrors the bill's Sales voucher (every Dr becomes Cr and vice versa). */
function reverseBill(s: AccountsState, bill: Bill, date: string, reason: string, by: string): Voucher {
  const sales = s.vouchers.find(v => v.id === bill.salesVoucherId);
  const note = addVoucher(s, {
    type: 'Credit Note', date, branch: bill.branch, reference: bill.billNo,
    narration: `Cancellation of ${bill.billNo}: ${reason}`,
    entries: (sales?.entries ?? []).map(e => ({ ledgerId: e.ledgerId, debit: e.credit, credit: e.debit })),
  }, by);
  note.billId = bill.id;
  bill.status = 'Cancelled';
  return note;
}

/** Cash + bank position (+Dr) up to a date - the same rule the Day Book uses. */
function cashPosition(s: AccountsState, upto: string, before: boolean, ledgerIds: string[]): number {
  return ledgerIds.reduce((sum, id) => sum
    + (s.ledgers.find(l => l.id === id)?.openingBalance ?? 0)
    + s.vouchers
      .filter(v => !v.cancelled && (before ? v.date < upto : v.date <= upto))
      .reduce((x, v) => x + v.entries.filter(e => e.ledgerId === id).reduce((y, e) => y + e.debit - e.credit, 0), 0), 0);
}

// ---------------------------------------------------------------------------
// Seed: a week of clinic trading, older days closed
// ---------------------------------------------------------------------------

/** Clinic services + retail products offered as quick picks on the bill form. */
export const BILL_CATALOG: Omit<BillItem, 'qty'>[] = [
  { description: 'Hair PRP Session', sac: '999722', rate: 4500, discountPercent: 0, gstPercent: 18 },
  { description: 'Laser Hair Reduction - Full Face', sac: '999722', rate: 6000, discountPercent: 10, gstPercent: 18 },
  { description: 'HydraFacial', sac: '999722', rate: 3500, discountPercent: 0, gstPercent: 18 },
  { description: 'Chemical Peel', sac: '999722', rate: 2500, discountPercent: 5, gstPercent: 18 },
  { description: 'Dermatologist Consultation', sac: '999312', rate: 500, discountPercent: 0, gstPercent: 18 },
  { description: 'Anti-Hair-Fall Treatment Package (6 sittings)', sac: '999722', rate: 18000, discountPercent: 15, gstPercent: 18 },
  { description: 'Minoxidil 5% Solution', sac: '3004', rate: 650, discountPercent: 0, gstPercent: 12 },
  { description: 'Sunscreen SPF 50', sac: '3304', rate: 850, discountPercent: 0, gstPercent: 18 },
  { description: 'Slimming Session - Body Contouring', sac: '999722', rate: 5500, discountPercent: 0, gstPercent: 18 },
  { description: 'Weight Loss Programme (8 sittings)', sac: '999722', rate: 24000, discountPercent: 10, gstPercent: 18 },
];

/** Seeded HR employees (hr.service seed) who sell at each branch. */
const SEED_SELLERS: Record<string, string[]> = {
  'Anna Nagar': ['EMP-seed-3'],
  Velachery: ['EMP-seed-2'],
  'T. Nagar': ['EMP-seed-4'],
  Adyar: ['EMP-seed-7', 'EMP-seed-9'],
};

/** Demo bills saved before employee attribution existed get a seller so targets have data. */
function attributeSeedBills(s: AccountsState): AccountsState {
  for (const b of s.bills) {
    if (b.kind === 'Service' && !b.employeeId && b.createdBy === 'Sneha Krishnan') b.employeeId = SEED_SELLERS[b.branch]?.[0];
  }
  return s;
}

const CUSTOMERS: [string, string][] = [
  ['Ananya Sharma', '9840012345'], ['Arjun Nair', '9884023456'], ['Fathima Begum', '9790034567'], ['Ravi Shankar', '9962045678'],
  ['Deepa Venkat', '9003056789'], ['Mohammed Irfan', '9445067890'], ['Swathi Rao', '9710078901'], ['Gokul Krishnan', '9677089012'],
];

function seedState(): AccountsState {
  const s: AccountsState = {
    ledgers: [
      { id: LEDGER.cash, name: 'Cash', group: 'Cash-in-Hand', openingBalance: 25000, system: true },
      { id: LEDGER.bank, name: 'HDFC Bank - Current A/c', group: 'Bank Accounts', openingBalance: 350000, system: true },
      { id: LEDGER.serviceIncome, name: 'Service Income', group: 'Sales Accounts', openingBalance: 0, system: true },
      { id: LEDGER.productSales, name: 'Product Sales', group: 'Sales Accounts', openingBalance: 0, system: true },
      { id: LEDGER.outputCgst, name: 'Output CGST', group: 'Duties & Taxes', openingBalance: 0, system: true },
      { id: LEDGER.outputSgst, name: 'Output SGST', group: 'Duties & Taxes', openingBalance: 0, system: true },
      { id: LEDGER.inputCgst, name: 'Input CGST', group: 'Duties & Taxes', openingBalance: 0, system: true },
      { id: LEDGER.inputSgst, name: 'Input SGST', group: 'Duties & Taxes', openingBalance: 0, system: true },
      { id: LEDGER.purchase, name: 'Purchase - Consumables', group: 'Purchase Accounts', openingBalance: 0, system: true },
      { id: LEDGER.capital, name: 'Capital Account', group: 'Capital Account', openingBalance: -375000, system: true },
      { id: 'L-RENT', name: 'Rent', group: 'Indirect Expenses', openingBalance: 0 },
      { id: 'L-SALARY', name: 'Salaries & Wages', group: 'Indirect Expenses', openingBalance: 0 },
      { id: 'L-EB', name: 'Electricity Charges', group: 'Indirect Expenses', openingBalance: 0 },
      { id: 'L-MKT', name: 'Marketing & Ads', group: 'Indirect Expenses', openingBalance: 0 },
      { id: 'L-OFFICE', name: 'Office Expenses', group: 'Indirect Expenses', openingBalance: 0 },
      { id: 'L-INT', name: 'Bank Interest', group: 'Indirect Incomes', openingBalance: 0 },
      { id: 'L-DSP', name: 'Derma Supplies Pvt Ltd', group: 'Sundry Creditors', openingBalance: 0, gstin: '33AABCD1234E1Z5' },
      { id: 'L-HCD', name: 'Hair Care Distributors', group: 'Sundry Creditors', openingBalance: 0, gstin: '33AACFH5678K1Z2' },
    ],
    vouchers: [],
    bills: [],
    dayCloses: [],
  };

  const by = 'Sneha Krishnan';
  const today = isoDate();
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const modes: PaymentMode[] = ['Cash', 'UPI', 'UPI', 'Card', 'Cash'];

  for (let back = 6; back >= 0; back--) {
    const date = addDays(today, -back);
    if (new Date(`${date}T00:00:00`).getDay() === 0) continue;

    const count = back === 0 ? 2 : 3 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const [name, phone] = pick(CUSTOMERS);
      const items: BillItem[] = [{ ...pick(BILL_CATALOG.filter(c => c.sac.startsWith('99'))), qty: 1 }];
      if (rand() > 0.6) items.push({ ...pick(BILL_CATALOG.filter(c => !c.sac.startsWith('99'))), qty: 1 + Math.floor(rand() * 2) });
      const branch = pick(BRANCHES);
      const bill = addBill(s, { kind: 'Service', date, dueDate: addDays(date, 7), customerName: name, customerPhone: phone, customerAddress: 'Chennai', customerGstin: '', branch, employeeId: pick(SEED_SELLERS[branch]), items, notes: '' }, by);
      const total = billTotals(items).grandTotal;
      const r = rand();
      if (r < 0.75) addReceipt(s, bill, total, pick(modes), date, by);
      else if (r < 0.9) addReceipt(s, bill, Math.round(total / 2), pick(modes), date, by);
    }

    const cashOut = (ledgerId: string, amount: number, narration: string, mode: PaymentMode = 'Cash') =>
      addVoucher(s, { type: 'Payment', date, mode, branch: 'Anna Nagar', narration, entries: [{ ledgerId, debit: amount, credit: 0 }, { ledgerId: mode === 'Cash' ? LEDGER.cash : LEDGER.bank, debit: 0, credit: amount }] }, by);

    if (back === 6) {
      cashOut('L-RENT', 45000, 'Rent for Anna Nagar branch', 'Bank Transfer');
      addVoucher(s, { type: 'Purchase', date, branch: 'Anna Nagar', reference: 'DSP/7781', narration: 'Consumables purchase - Derma Supplies', entries: [{ ledgerId: LEDGER.purchase, debit: 25000, credit: 0 }, { ledgerId: LEDGER.inputCgst, debit: 2250, credit: 0 }, { ledgerId: LEDGER.inputSgst, debit: 2250, credit: 0 }, { ledgerId: 'L-DSP', debit: 0, credit: 29500 }] }, by);
    }
    if (back === 5) cashOut('L-EB', 3200, 'EB bill - Velachery');
    if (back === 4) {
      addVoucher(s, { type: 'Debit Note', date, branch: 'Anna Nagar', reference: 'DSP/7781', narration: '2 damaged face wash bottles returned to Derma Supplies', entries: [{ ledgerId: 'L-DSP', debit: 520, credit: 0 }, { ledgerId: LEDGER.purchase, debit: 0, credit: 520 }] }, by);
      cashOut('L-DSP', 20000, 'Part payment to Derma Supplies', 'Bank Transfer');
    }
    if (back === 3) cashOut('L-OFFICE', 850, 'Stationery & printing');
    if (back === 2) addVoucher(s, { type: 'Contra', date, branch: 'Anna Nagar', narration: 'Cash deposited into HDFC', entries: [{ ledgerId: LEDGER.bank, debit: 30000, credit: 0 }, { ledgerId: LEDGER.cash, debit: 0, credit: 30000 }] }, by);
    if (back === 1) cashOut('L-MKT', 6500, 'Instagram ads - October', 'Card');
  }

  // A duplicate bill reversed with a credit note.
  const cancelDate = addDays(today, -3);
  const wrong = addBill(s, { kind: 'Service', date: cancelDate, dueDate: null, customerName: 'Swathi Rao', customerPhone: '9710078901', customerAddress: 'Chennai', customerGstin: '', branch: 'Adyar', items: [{ ...BILL_CATALOG[2], qty: 1 }], notes: '' }, by);
  reverseBill(s, wrong, cancelDate, 'billed twice', by);

  // Proforma quotes.
  const p1 = addBill(s, { kind: 'Proforma', date: addDays(today, -2), dueDate: addDays(today, 12), customerName: 'Karthika Suresh', customerPhone: '9884567123', customerAddress: 'Mylapore, Chennai', customerGstin: '', branch: 'T. Nagar', items: [{ description: 'Hair Transplant - 2500 grafts (FUE)', sac: '999311', qty: 1, rate: 85000, discountPercent: 10, gstPercent: 18 }, { ...BILL_CATALOG[0], qty: 3 }], notes: 'Includes 1 follow-up PRP free.' }, by);
  p1.status = 'Sent';
  addBill(s, { kind: 'Proforma', date: today, dueDate: addDays(today, 15), customerName: 'Wellness Corp Pvt Ltd', customerPhone: '9444012000', customerAddress: 'OMR, Chennai', customerGstin: '33AAACW9999F1Z1', branch: 'Velachery', items: [{ description: 'Corporate skin check-up camp (50 employees)', sac: '999312', qty: 50, rate: 400, discountPercent: 0, gstPercent: 18 }], notes: 'On-site camp, 1 day.' }, by);

  // Close every seeded day before yesterday - each closing is the next day's opening.
  const cashIds = s.ledgers.filter(l => CASH_GROUPS.includes(l.group)).map(l => l.id);
  const bankIds = cashIds.filter(id => id !== LEDGER.cash);
  for (let back = 6; back >= 2; back--) {
    const date = addDays(today, -back);
    const day = s.vouchers.filter(v => v.date === date && v.type !== 'Contra');
    const flow = (side: 'debit' | 'credit') => day.reduce((x, v) => x + v.entries.filter(e => cashIds.includes(e.ledgerId)).reduce((y, e) => y + e[side], 0), 0);
    const bankClosing = cashPosition(s, date, false, bankIds);
    const closing = cashPosition(s, date, false, cashIds);
    s.dayCloses.push({
      date, opening: cashPosition(s, date, true, cashIds), receipts: flow('debit'), payments: flow('credit'), closing,
      cashClosing: closing - bankClosing, bankClosing, closedBy: by, closedAt: new Date(`${date}T21:00:00`).toISOString(),
    });
  }

  return s;
}
