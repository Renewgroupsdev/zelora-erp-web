import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AccountsService, LEDGER } from '../../../../shared/common-services/accounts.service';
import {
  CASH_GROUPS,
  Ledger,
  LedgerGroup,
  PAYMENT_MODES,
  PaymentMode,
  VOUCHER_KEYS,
  VOUCHER_TYPES,
  Voucher,
  VoucherType,
  drCr,
} from '../../../../shared/models/accounts.model';
import { isoDate } from '../../../../shared/utils/format.util';

interface Line {
  side: 'Dr' | 'Cr';
  ledgerId: string;
  amount: number | null;
}

/** Which ledgers make sense on the "particulars" side of each simple voucher. */
const PARTICULAR_GROUPS: Partial<Record<VoucherType, LedgerGroup[]>> = {
  Receipt: ['Sundry Debtors', 'Sales Accounts', 'Indirect Incomes', 'Capital Account', 'Sundry Creditors'],
  Payment: ['Indirect Expenses', 'Direct Expenses', 'Sundry Creditors', 'Purchase Accounts', 'Duties & Taxes', 'Sundry Debtors', 'Capital Account'],
};

/** Starting Dr/Cr lines for the grid vouchers, the way Tally pre-fills them. */
const DEFAULT_LINES: Partial<Record<VoucherType, Line[]>> = {
  Sales: [{ side: 'Dr', ledgerId: '', amount: null }, { side: 'Cr', ledgerId: LEDGER.serviceIncome, amount: null }, { side: 'Cr', ledgerId: LEDGER.outputCgst, amount: null }, { side: 'Cr', ledgerId: LEDGER.outputSgst, amount: null }],
  Purchase: [{ side: 'Dr', ledgerId: LEDGER.purchase, amount: null }, { side: 'Dr', ledgerId: LEDGER.inputCgst, amount: null }, { side: 'Dr', ledgerId: LEDGER.inputSgst, amount: null }, { side: 'Cr', ledgerId: '', amount: null }],
  'Credit Note': [{ side: 'Dr', ledgerId: LEDGER.serviceIncome, amount: null }, { side: 'Cr', ledgerId: '', amount: null }],
  'Debit Note': [{ side: 'Dr', ledgerId: '', amount: null }, { side: 'Cr', ledgerId: LEDGER.purchase, amount: null }],
  Journal: [{ side: 'Dr', ledgerId: '', amount: null }, { side: 'Cr', ledgerId: '', amount: null }],
};

@Component({
  selector: 'app-voucher-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './voucher-form.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './voucher-form.scss'],
})
export class VoucherForm {
  private readonly dialogRef = inject(MatDialogRef<VoucherForm, Voucher>);
  private readonly data = inject<{ type?: VoucherType } | null>(MAT_DIALOG_DATA, { optional: true });
  readonly acc = inject(AccountsService);

  readonly types = VOUCHER_TYPES;
  readonly keys = VOUCHER_KEYS;
  readonly modes = PAYMENT_MODES;
  readonly today = isoDate();
  readonly drCr = drCr;
  readonly type = signal<VoucherType>(this.data?.type ?? 'Receipt');
  readonly simple = computed(() => ['Receipt', 'Payment', 'Contra'].includes(this.type()));
  readonly error = signal<string | null>(null);

  date = this.today;
  branch = this.acc.branches[0];
  narration = '';
  reference = '';
  // Simple vouchers
  mode: PaymentMode = 'Cash';
  accountId: string = LEDGER.cash;
  particularId = '';
  amount: number | null = null;
  // Grid vouchers
  lines: Line[] = [];

  readonly cashLedgers = computed(() => this.acc.ledgersIn(CASH_GROUPS));

  constructor() {
    this.setType(this.type());
  }

  /** Tally shortcuts: F4 Contra, F5 Payment, F6 Receipt, F7 Journal, F8 Sales, F9 Purchase, Ctrl+F8 / Ctrl+F9 notes. */
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const hit = (Object.entries(VOUCHER_KEYS) as [VoucherType, string][]).find(([, k]) => k === (e.ctrlKey ? `Ctrl+${e.key}` : e.key));
    if (hit) {
      e.preventDefault();
      this.setType(hit[0]);
    }
  }

  setType(type: VoucherType): void {
    this.type.set(type);
    this.error.set(null);
    this.lines = (DEFAULT_LINES[type] ?? []).map(l => ({ ...l }));
    if (type === 'Contra') {
      this.accountId = LEDGER.cash;
      this.particularId = LEDGER.bank;
    } else if (this.simple()) {
      this.setMode(this.mode);
      this.particularId = '';
    }
  }

  setMode(mode: PaymentMode): void {
    this.mode = mode;
    if (this.type() !== 'Contra') this.accountId = mode === 'Cash' ? LEDGER.cash : LEDGER.bank;
  }

  particularOptions(): Ledger[] {
    if (this.type() === 'Contra') return this.cashLedgers();
    const groups = PARTICULAR_GROUPS[this.type()];
    return groups ? this.acc.ledgersIn(groups) : this.acc.ledgers();
  }

  /** Simple-voucher labels, Tally wording. */
  labels(): { account: string; particular: string } {
    switch (this.type()) {
      case 'Receipt': return { account: 'Account (Dr) - money in to', particular: 'Particulars (Cr) - received from' };
      case 'Payment': return { account: 'Account (Cr) - paid from', particular: 'Particulars (Dr) - paid to' };
      default: return { account: 'From (Cr)', particular: 'To (Dr)' };
    }
  }

  balanceOf(id: string): string {
    return id ? drCr(this.acc.balance(id)) : '';
  }

  addLine(side: 'Dr' | 'Cr'): void {
    this.lines = [...this.lines, { side, ledgerId: '', amount: null }];
  }

  removeLine(i: number): void {
    if (this.lines.length > 2) this.lines = this.lines.filter((_, x) => x !== i);
  }

  total(side: 'Dr' | 'Cr'): number {
    return this.lines.filter(l => l.side === side).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  }

  difference(): number {
    return Math.round((this.total('Dr') - this.total('Cr')) * 100) / 100;
  }

  /** Puts the running difference on the given line - like Tally's auto-balance. */
  autoBalance(i: number): void {
    const l = this.lines[i];
    const diff = this.difference() + (l.side === 'Dr' ? -(Number(l.amount) || 0) : Number(l.amount) || 0);
    l.amount = Math.abs(diff) || l.amount;
  }

  save(): void {
    this.error.set(null);
    let entries;
    if (this.simple()) {
      const amt = Number(this.amount) || 0;
      if (!this.particularId) { this.error.set('Select the particulars ledger.'); return; }
      if (this.particularId === this.accountId) { this.error.set('Both sides cannot be the same ledger.'); return; }
      // Receipt: Dr account / Cr particular. Payment & Contra: Dr particular / Cr account.
      entries = this.type() === 'Receipt'
        ? [{ ledgerId: this.accountId, debit: amt, credit: 0 }, { ledgerId: this.particularId, debit: 0, credit: amt }]
        : [{ ledgerId: this.particularId, debit: amt, credit: 0 }, { ledgerId: this.accountId, debit: 0, credit: amt }];
    } else {
      entries = this.lines.filter(l => l.ledgerId || l.amount).map(l => ({ ledgerId: l.ledgerId, debit: l.side === 'Dr' ? Number(l.amount) || 0 : 0, credit: l.side === 'Cr' ? Number(l.amount) || 0 : 0 }));
    }

    const result = this.acc.postVoucher({
      type: this.type(), date: this.date, entries, branch: this.branch,
      narration: this.narration.trim(), reference: this.reference.trim() || undefined,
      mode: this.simple() && this.type() !== 'Contra' ? this.mode : undefined,
    });
    if (typeof result === 'string') {
      this.error.set(result);
      return;
    }
    this.dialogRef.close(result);
  }

  close(): void {
    this.dialogRef.close();
  }
}
