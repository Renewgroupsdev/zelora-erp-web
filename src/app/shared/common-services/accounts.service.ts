import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';
import { ApiDataService } from '../../core/http/api.service';
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
  Voucher,
  VoucherEntry,
  VoucherType,
  billTotals,
  voucherAmount,
} from '../models/accounts.model';
import { addDays, isoDate } from '../utils/format.util';
import { NotificationService } from './notification.service';
import { BranchOptionsService } from './branch-options.service';

const BASE = 'accounts';

interface AccountsState {
  ledgers: Ledger[];
  vouchers: Voucher[];
  bills: Bill[];
  dayCloses: DayClose[];
}

const emptyState = (): AccountsState => ({ ledgers: [], vouchers: [], bills: [], dayCloses: [] });

/**
 * Stable codes of the fixed system ledgers the posting rules rely on (Ledger.code on the server). Ledger ids are
 * server ids, so look a system ledger up with AccountsService.idOf(code) - never use the code as an id.
 */
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
 * Accounts store backed by /api/accounts. The server owns the books (posting rules, numbering, day locks, audit trail):
 * state is loaded from GET /accounts/state when a user is signed in, and every mutation is an API call whose response
 * (the rows it created / changed) is merged into the signals. Read helpers (balances, day book, reports) are computed on
 * the client from the loaded lists. Mutations resolve to the saved record, or to the server's message (a string) when
 * the action is refused.
 */
@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly branchList = inject(BranchOptionsService);
  private readonly state = signal<AccountsState>(emptyState());

  /** True once the books were loaded for the signed-in user. */
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly ledgers = computed(() => this.state().ledgers);
  readonly vouchers = computed(() => this.state().vouchers.filter(v => !v.cancelled));
  readonly bills = computed(() => this.state().bills);
  readonly dayCloses = computed(() => this.state().dayCloses);
  /** Branch names from GET /branches/options (live array, see BranchOptionsService). */
  readonly branches = this.branchList.nameList;
  /** Resolves once the branch options are loaded (forms use it to pick a default branch). */
  readonly loadBranches = () => this.branchList.load();

  readonly cashLedgers = computed(() => this.ledgers().filter(l => CASH_GROUPS.includes(l.group)));
  readonly receivables = computed(() => this.bills()
    .filter(b => b.kind === 'Service' && (b.status === 'Unpaid' || b.status === 'Partially Paid'))
    .reduce((s, b) => s + billTotals(b.items).grandTotal - b.paidAmount, 0));

  constructor() {
    // Load for the signed-in user; a sign-out (or another login) never shows the previous user's books.
    effect(() => {
      const user = this.auth.currentUser();
      untracked(() => {
        this.state.set(emptyState());
        this.loaded.set(false);
        if (user) void this.load();
      });
    });
    this.branchList.ensure();
  }

  get userName(): string {
    return this.auth.currentUser()?.name || 'Accountant';
  }

  /** Fetches ledgers, vouchers, bills and day closes. Safe to call again to refresh. */
  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const res = await firstValueFrom(this.api.GET(`${BASE}/state`) as Observable<any>);
      const d = res?.data ?? {};
      this.state.set({
        ledgers: (d.ledgers ?? []).map(toLedger),
        vouchers: (d.vouchers ?? []).map(toVoucher),
        bills: (d.bills ?? []).map(toBill),
        dayCloses: (d.day_closes ?? []).map(toDayClose),
      });
      this.loaded.set(true);
    } catch (e) {
      this.loadError.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Id of a system ledger by its stable code ('' while the books are not loaded). */
  idOf(code: string): string {
    return this.ledgers().find(l => l.code === code)?.id ?? '';
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
    const cashLedgerId = this.idOf(LEDGER.cash);
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
    const bankClosing = [...cashIds].filter(id => id !== cashLedgerId).reduce((s, id) => s + this.balance(id, date), 0);
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

  /** Locks the day on the server (it works the figures out itself); its closing balance is the next day's opening. */
  async closeDay(date: string): Promise<DayClose | null> {
    if (this.isClosed(date) || date > isoDate()) return null;
    const res = await this.send('POST', `${BASE}/day-closes`, { date });
    if (typeof res === 'string') {
      this.notifyError('Day not closed', res);
      return null;
    }
    this.merge(res.data.changes);
    const close = this.dayCloses().find(d => d.date === date) ?? null;
    if (close) {
      this.notifications.add({ type: 'accounts', title: `Day closed · ${date}`, message: `Collection ₹${close.receipts.toLocaleString('en-IN')} · closing ₹${close.closing.toLocaleString('en-IN')} carried to ${addDays(date, 1)}.`, link: '/app/accounts/day-book' });
    }
    return close;
  }

  async reopenDay(date: string): Promise<boolean> {
    const res = await this.send('DELETE', `${BASE}/day-closes/${date}`);
    if (typeof res === 'string') {
      this.notifyError('Day not reopened', res);
      return false;
    }
    const removed = String(res.data?.removed_day_close_id ?? '');
    this.state.update(s => ({ ...s, dayCloses: s.dayCloses.filter(d => d.id !== removed && d.date !== date) }));
    return true;
  }

  // ---- Ledgers ----
  async addLedger(input: Omit<Ledger, 'id'>): Promise<Ledger | string> {
    if (this.ledgers().some(l => l.name.trim().toLowerCase() === input.name.trim().toLowerCase())) return 'A ledger with this name already exists.';
    const res = await this.send('POST', `${BASE}/ledgers`, {
      name: input.name.trim(), group: input.group, opening_balance: input.openingBalance,
      phone: input.phone || null, gstin: input.gstin || null, address: input.address || null,
    });
    return this.saved(res, s => s.ledgers);
  }

  async updateLedger(id: string, patch: Partial<Ledger>): Promise<Ledger | string> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body['name'] = patch.name;
    if (patch.group !== undefined) body['group'] = patch.group;
    if (patch.openingBalance !== undefined) body['opening_balance'] = patch.openingBalance;
    if (patch.phone !== undefined) body['phone'] = patch.phone || null;
    if (patch.gstin !== undefined) body['gstin'] = patch.gstin || null;
    if (patch.address !== undefined) body['address'] = patch.address || null;
    const res = await this.send('PUT', `${BASE}/ledgers/${id}`, body);
    if (typeof res !== 'string') this.merge(res.data.changes);
    return typeof res === 'string' ? res : this.ledger(id)!;
  }

  // ---- Vouchers ----
  /** Returns the voucher, or an error message when it can't be posted. */
  async postVoucher(input: NewVoucherInput): Promise<Voucher | string> {
    const error = validateVoucher(input, this.isClosed(input.date));
    if (error) return error;
    const unit = this.unitOf(input.branch);
    if (!unit) return 'Select a branch.';
    const res = await this.send('POST', `${BASE}/vouchers`, {
      type: input.type, date: input.date, narration: input.narration || null, mode: input.mode ?? null, reference: input.reference ?? null,
      ...unit,
      entries: input.entries.filter(e => e.debit || e.credit).map(e => ({ ledger_id: Number(e.ledgerId), debit: e.debit, credit: e.credit })),
    });
    return this.saved(res, s => s.vouchers);
  }

  // ---- Bills ----
  async createBill(input: NewBillInput, collect: { amount: number; mode: PaymentMode } | null): Promise<Bill | string> {
    if (input.kind === 'Service' && this.isClosed(input.date)) return `${input.date} is closed in the Day Book - reopen it or bill today.`;
    const unit = this.unitOf(input.branch);
    if (!unit) return 'Select a branch.';
    const employee = Number(input.employeeId);
    const res = await this.send('POST', `${BASE}/bills`, {
      kind: input.kind, date: input.date, due_date: input.dueDate || null,
      customer_name: input.customerName, customer_phone: input.customerPhone || null, customer_address: input.customerAddress || null,
      customer_gstin: input.customerGstin || null, notes: input.notes || null,
      // HR employee ids are server ids; anything else (an unsaved / legacy id) is sent as "no seller".
      employee_id: Number.isInteger(employee) && employee > 0 ? employee : null,
      ...unit,
      items: input.items.map(i => ({ description: i.description, sac: i.sac || null, qty: i.qty, rate: i.rate, discount_percent: i.discountPercent, gst_percent: i.gstPercent })),
      collect: input.kind === 'Service' && collect?.amount ? { amount: collect.amount, mode: collect.mode } : null,
    });
    return this.saved(res, s => s.bills);
  }

  async convertProforma(id: string, date = isoDate()): Promise<Bill | string> {
    const p = this.bills().find(b => b.id === id);
    if (!p || p.kind !== 'Proforma' || p.status === 'Converted' || p.status === 'Cancelled') return 'Only an open proforma can be converted.';
    if (this.isClosed(date)) return `${date} is closed in the Day Book.`;
    const res = await this.send('POST', `${BASE}/bills/${id}/convert`, { date });
    return this.saved(res, s => s.bills);
  }

  async markProformaSent(id: string): Promise<void> {
    const res = await this.send('POST', `${BASE}/bills/${id}/send`, {});
    if (typeof res === 'string') this.notifyError('Not updated', res);
    else this.merge(res.data.changes);
  }

  async collectPayment(billId: string, amount: number, mode: PaymentMode, date = isoDate()): Promise<Voucher | string> {
    const bill = this.bills().find(b => b.id === billId);
    if (!bill || bill.kind !== 'Service') return 'Bill not found.';
    const due = billTotals(bill.items).grandTotal - bill.paidAmount;
    if (amount <= 0 || amount > due + 0.01) return `Amount must be between ₹1 and ₹${due.toLocaleString('en-IN')}.`;
    if (this.isClosed(date)) return `${date} is closed in the Day Book.`;
    const res = await this.send('POST', `${BASE}/bills/${billId}/payments`, { amount, mode, date });
    return this.saved(res, s => s.vouchers);
  }

  /** Proforma: just cancelled. Unpaid service bill: reversed with a Credit Note (sales return). */
  async cancelBill(id: string, reason: string): Promise<Voucher | string | null> {
    const bill = this.bills().find(b => b.id === id);
    if (!bill) return 'Bill not found.';
    if (bill.kind === 'Service' && bill.paidAmount > 0) return 'This bill has collections - refund them with a Payment voucher first.';
    const date = isoDate();
    if (bill.kind === 'Service' && this.isClosed(date)) return `${date} is closed in the Day Book.`;
    const res = await this.send('POST', `${BASE}/bills/${id}/cancel`, { reason, date });
    if (typeof res === 'string') return res;
    this.merge(res.data.changes);
    const note = this.state().vouchers.find(v => v.billId === id && v.type === 'Credit Note');
    return bill.kind === 'Proforma' ? null : note ?? null;
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

  // ---- API plumbing ----

  /** Branch / franchise picked by name -> the type + id pair the API stores. */
  private unitOf(name: string): { branch_type: string; branch_id: number } | null {
    const option = this.branchList.byName(name);
    return option ? { branch_type: option.type, branch_id: option.id } : null;
  }

  /** The call's response, or the server's message when it was refused. */
  private async send(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<any | string> {
    try {
      const call = method === 'POST' ? this.api.POST(path, body) : method === 'PUT' ? this.api.PUT(path, body) : this.api.Delete(path, {});
      return await firstValueFrom(call as Observable<any>);
    } catch (e) {
      return errorMessage(e);
    }
  }

  /** Merges the response's changed rows and returns the record named by `result_id` from the matching list. */
  private saved<T extends { id: string }>(res: any | string, list: (s: AccountsState) => T[]): T | string {
    if (typeof res === 'string') return res;
    this.merge(res.data.changes);
    const id = String(res.data.result_id);
    return list(this.state()).find(r => r.id === id) as T;
  }

  /** Upserts the rows the server created / changed (every list by id). */
  private merge(changes: { ledgers?: any[]; vouchers?: any[]; bills?: any[]; day_closes?: any[] } | undefined): void {
    if (!changes) return;
    // Ledgers / vouchers / bills: changed rows lead (the lists arrive updated_at desc); day closes keep their order.
    const upsertFront = <T extends { id: string }>(list: T[], rows: T[]) => [...rows.filter((r, i, a) => a.findIndex(x => x.id === r.id) === i), ...list.filter(x => !rows.some(r => r.id === x.id))];
    const upsert = <T extends { id: string }>(list: T[], rows: T[]) => {
      const next = [...list];
      for (const row of rows) {
        const at = next.findIndex(x => x.id === row.id);
        if (at >= 0) next[at] = row;
        else next.push(row);
      }
      return next;
    };
    this.state.update(s => ({
      ledgers: upsertFront(s.ledgers, (changes.ledgers ?? []).map(toLedger)),
      vouchers: upsertFront(s.vouchers, (changes.vouchers ?? []).map(toVoucher)),
      bills: upsertFront(s.bills, (changes.bills ?? []).map(toBill)),
      // A re-closed day replaces the earlier (reopened) close of the same date.
      dayCloses: (changes.day_closes ?? []).map(toDayClose).reduce((acc, row) => upsert(acc.filter(d => d.date !== row.date || d.id === row.id), [row]), s.dayCloses),
    }));
  }

  private notifyError(title: string, message: string): void {
    Swal.fire({ icon: 'error', title, text: message, confirmButtonColor: '#6C63FF' });
  }
}

// ---------------------------------------------------------------------------
// API -> model mappers and helpers
// ---------------------------------------------------------------------------

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

function errorMessage(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    const body = e.error ?? {};
    const details = body.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)
      ? Object.values(body.errors as Record<string, string[]>).flat().filter(m => typeof m === 'string')
      : [];
    return (details.length ? details.slice(0, 4).join(' ') : body.message || e.message || 'Something went wrong.');
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

function toLedger(r: any): Ledger {
  return {
    id: String(r.id), code: r.code ?? undefined, name: r.name, group: r.group, openingBalance: num(r.opening_balance),
    phone: r.phone ?? undefined, gstin: r.gstin ?? undefined, address: r.address ?? undefined, system: !!r.system,
  };
}

function toVoucher(r: any): Voucher {
  return {
    id: String(r.id), voucherNo: r.voucher_no, type: r.type, date: r.date, narration: str(r.narration),
    mode: r.mode ?? undefined, reference: r.reference ?? undefined, billId: r.bill_id ? String(r.bill_id) : undefined,
    branch: str(r.branch), createdBy: str(r.created_by), createdAt: str(r.created_at), cancelled: !!r.cancelled,
    entries: ((r.entries ?? []) as any[]).map(e => ({ ledgerId: String(e.ledger_id), debit: num(e.debit), credit: num(e.credit) })),
  };
}

function toBill(r: any): Bill {
  return {
    id: String(r.id), billNo: r.bill_no, kind: r.kind, date: r.date, dueDate: r.due_date ?? null,
    customerName: r.customer_name, customerPhone: str(r.customer_phone), customerAddress: str(r.customer_address), customerGstin: str(r.customer_gstin),
    partyLedgerId: r.party_ledger_id ? String(r.party_ledger_id) : undefined, branch: str(r.branch),
    items: ((r.items ?? []) as any[]).map(i => ({ description: i.description, sac: str(i.sac), qty: num(i.qty), rate: num(i.rate), discountPercent: num(i.discount_percent), gstPercent: num(i.gst_percent) })),
    notes: str(r.notes), status: r.status, paidAmount: num(r.paid_amount),
    convertedFromId: r.converted_from_id ? String(r.converted_from_id) : undefined,
    convertedToId: r.converted_to_id ? String(r.converted_to_id) : undefined,
    salesVoucherId: r.sales_voucher_id ? String(r.sales_voucher_id) : undefined,
    employeeId: r.employee_id ? String(r.employee_id) : undefined,
    createdBy: str(r.created_by), createdAt: str(r.created_at),
  };
}

function toDayClose(r: any): DayClose {
  return {
    id: String(r.id), date: r.date, opening: num(r.opening), receipts: num(r.receipts), payments: num(r.payments), closing: num(r.closing),
    cashClosing: num(r.cash_closing), bankClosing: num(r.bank_closing), closedBy: str(r.closed_by), closedAt: str(r.closed_at),
  };
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
