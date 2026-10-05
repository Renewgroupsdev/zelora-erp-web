import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { LEDGER_GROUPS, drCr } from '../../../shared/models/accounts.model';
import { downloadExcel, fileStamp } from '../../../shared/utils/export.util';
import { displayDate, inr, isoDate } from '../../../shared/utils/format.util';
import { AccountsListBase } from '../accounts-list-base';
import { LedgerStatement } from './ledger-statement/ledger-statement';
import { CreateLedger } from './create-ledger/create-ledger';

type View = 'ledgers' | 'trial' | 'pl';

const LEDGER_COLUMNS: TableColumn[] = [
  { key: 'name', header: 'Ledger', width: '24%' },
  { key: 'group', header: 'Under Group', width: '16%' },
  { key: 'opening', header: 'Opening', width: '13%' },
  { key: 'debit', header: 'Debit', width: '13%' },
  { key: 'credit', header: 'Credit', width: '13%' },
  { key: 'closing', header: 'Closing Balance', width: '14%' },
  { key: 'actions', header: '', type: 'quickActions', width: '6%', sortable: false },
];

const TRIAL_COLUMNS: TableColumn[] = [
  { key: 'name', header: 'Particulars', width: '40%' },
  { key: 'group', header: 'Group', width: '22%' },
  { key: 'dr', header: 'Debit', width: '16%' },
  { key: 'cr', header: 'Credit', width: '16%' },
  { key: 'actions', header: '', type: 'quickActions', width: '6%', sortable: false },
];

@Component({
  selector: 'app-ledgers',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, CommonFilterCard, CommonTableCard, ModuleTabs],
  templateUrl: './ledgers.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', './ledgers.scss'],
})
export class Ledgers extends AccountsListBase {
  protected readonly noun = 'ledgers';
  protected override filterFields = { status: 'group', source: 'source', branch: ['branch'] };
  readonly view = signal<View>('ledgers');
  readonly asOn = signal(isoDate());
  readonly plFrom = signal(`${isoDate().slice(0, 7)}-01`);
  readonly plTo = signal(isoDate());
  readonly inr = inr;
  readonly drCr = drCr;
  readonly displayDate = displayDate;

  override filters = [{ key: 'status', label: 'Group', options: LEDGER_GROUPS }];
  columns: TableColumn[] = LEDGER_COLUMNS;
  override sortActive = 'group';
  override sortDirection: 'asc' | 'desc' = 'asc';

  readonly trial = computed(() => {
    const rows = this.acc.trialBalance(this.asOn());
    const dr = rows.filter(r => r.balance > 0).reduce((s, r) => s + r.balance, 0);
    const cr = rows.filter(r => r.balance < 0).reduce((s, r) => s - r.balance, 0);
    return { dr, cr, diff: Math.round((dr - cr) * 100) / 100 };
  });
  readonly pl = computed(() => this.acc.profitAndLoss(this.plFrom(), this.plTo()));

  setView(view: View): void {
    this.view.set(view);
    this.columns = view === 'trial' ? TRIAL_COLUMNS : LEDGER_COLUMNS;
    this.currentPage = 1;
    this.refresh();
  }

  protected allRows(): TableRow[] {
    const statement = [{ key: 'statement', icon: 'bi-journal-richtext', label: 'Ledger statement', variant: 'primary' as const }];
    if (this.view() === 'trial') {
      return this.acc.trialBalance(this.asOn()).map(r => ({
        id: r.ledger.id,
        name: r.ledger.name,
        group: r.ledger.group,
        dr: r.balance > 0 ? inr(r.balance) : '', __dr: r.balance > 0 ? r.balance : 0,
        cr: r.balance < 0 ? inr(-r.balance) : '', __cr: r.balance < 0 ? -r.balance : 0,
        actions: statement,
      }));
    }
    return this.acc.ledgers().map(l => {
      const t = this.acc.ledgerTotals(l.id);
      return {
        id: l.id,
        name: l.name,
        group: l.group,
        __group: `${LEDGER_GROUPS.indexOf(l.group).toString().padStart(2, '0')}${l.name}`,
        searchText: `${l.phone ?? ''} ${l.gstin ?? ''}`,
        opening: drCr(l.openingBalance), __opening: l.openingBalance,
        debit: inr(t.debit), __debit: t.debit,
        credit: inr(t.credit), __credit: t.credit,
        closing: drCr(t.closing), __closing: t.closing,
        actions: statement,
      };
    });
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    this.openDialog(LedgerStatement, { ledgerId: event.row['id'] }, '920px');
  }

  setAsOn(v: string): void {
    if (v) this.asOn.set(v);
  }

  createLedger(): void {
    this.openDialog(CreateLedger, null, '640px');
  }

  exportExcel(): void {
    if (this.view() === 'pl') {
      const p = this.pl();
      downloadExcel(`profit-loss-${this.plFrom()}-to-${this.plTo()}`, [{
        name: 'Profit & Loss',
        columns: [{ header: 'Particulars', key: 'name' }, { header: 'Group', key: 'group' }, { header: 'Income', key: 'income' }, { header: 'Expense', key: 'expense' }],
        rows: [
          ...p.income.map(r => ({ name: r.ledger.name, group: r.ledger.group, income: r.amount })),
          ...p.expenses.map(r => ({ name: r.ledger.name, group: r.ledger.group, expense: r.amount })),
          { name: p.net >= 0 ? 'Net Profit' : 'Net Loss', income: '', expense: Math.abs(p.net) },
        ],
        totals: { name: 'TOTAL', income: p.totalIncome, expense: p.totalExpense + Math.max(0, p.net) },
      }]);
      return;
    }
    const sheet = this.exportSheet(this.view() === 'trial' ? `Trial Balance ${this.asOn()}` : 'Ledgers');
    if (this.view() === 'trial') sheet.rows.push({ name: 'Grand Total', dr: this.trial().dr, cr: this.trial().cr });
    downloadExcel(`${this.view() === 'trial' ? 'trial-balance-' + this.asOn() : 'ledgers-' + fileStamp()}`, [sheet]);
  }
}
