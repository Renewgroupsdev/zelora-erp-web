import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { DetailCardData, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { CASH_GROUPS, VOUCHER_TYPES, Voucher, VoucherType, voucherAmount } from '../../../shared/models/accounts.model';
import { downloadExcel, fileStamp } from '../../../shared/utils/export.util';
import { displayDate, inr } from '../../../shared/utils/format.util';
import { AccountsListBase } from '../accounts-list-base';
import { VoucherForm } from './voucher-form/voucher-form';
import { VoucherView } from './voucher-view/voucher-view';

type View = 'All' | 'Credit Note' | 'Debit Note';

@Component({
  selector: 'app-vouchers',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, ModuleTabs],
  templateUrl: './vouchers.html',
  styleUrl: '../../../shared/styles/erp-page.scss',
})
export class Vouchers extends AccountsListBase {
  protected readonly noun = 'vouchers';
  readonly view = signal<View>('All');

  override filters = [
    { key: 'status', label: 'Voucher Type', options: VOUCHER_TYPES },
    { key: 'branch', label: 'Branch', options: this.acc.branches, multiSelect: true },
    { key: 'date', label: 'Date' },
  ];

  columns: TableColumn[] = [
    { key: 'date', header: 'Date', width: '9%' },
    { key: 'voucherNo', header: 'Voucher No', width: '12%' },
    { key: 'status', header: 'Type', type: 'badge', width: '9%' },
    { key: 'particulars', header: 'Particulars', width: '20%' },
    { key: 'narration', header: 'Narration', width: '20%' },
    { key: 'mode', header: 'Mode', width: '7%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '9%' },
    { key: 'amount', header: 'Amount', width: '9%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '5%', sortable: false },
  ];

  override sortActive = 'date';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.acc.vouchers();
    const month = new Date().toISOString().slice(0, 7);
    const sum = (t: VoucherType) => list.filter(v => v.type === t && v.date.startsWith(month)).reduce((s, v) => s + voucherAmount(v), 0);
    return [
      { label: 'Receipts this month', value: inr(sum('Receipt')), icon: 'bi-box-arrow-in-down', iconVariant: 'green' },
      { label: 'Payments this month', value: inr(sum('Payment')), icon: 'bi-box-arrow-up', iconVariant: 'orange' },
      { label: 'Credit Notes', value: inr(sum('Credit Note')), icon: 'bi-arrow-down-left-circle', iconVariant: 'blue', trendText: `${list.filter(v => v.type === 'Credit Note').length} notes` },
      { label: 'Debit Notes', value: inr(sum('Debit Note')), icon: 'bi-arrow-up-right-circle', iconVariant: 'purple', trendText: `${list.filter(v => v.type === 'Debit Note').length} notes` },
    ];
  });

  setView(view: View): void {
    this.view.set(view);
    this.currentPage = 1;
    this.refresh();
  }

  /** Tally shows the "other side" ledger: party for receipts/payments, debit side otherwise. */
  private particulars(v: Voucher): string {
    const nonCash = v.entries.filter(e => !CASH_GROUPS.includes(this.acc.ledger(e.ledgerId)?.group ?? 'Cash-in-Hand'));
    const show = v.type === 'Contra' ? v.entries.filter(e => e.debit) : nonCash.length ? nonCash : v.entries;
    const main = show.find(e => ['Sundry Debtors', 'Sundry Creditors'].includes(this.acc.ledger(e.ledgerId)?.group ?? '')) ?? show[0];
    const rest = show.length - 1;
    return `${this.acc.ledgerName(main.ledgerId)}${rest > 0 ? ` +${rest}` : ''}`;
  }

  protected allRows(): TableRow[] {
    const view = this.view();
    return this.acc.vouchers().filter(v => view === 'All' || v.type === view).map(v => {
      const amount = voucherAmount(v);
      return {
        id: v.id,
        date: displayDate(v.date), __date: v.date,
        voucherNo: v.voucherNo,
        status: v.type,
        particulars: this.particulars(v),
        narration: v.narration || '-',
        searchText: `${v.reference ?? ''} ${v.entries.map(e => this.acc.ledgerName(e.ledgerId)).join(' ')}`,
        mode: v.mode ?? '-',
        branch: v.branch,
        amount: inr(amount), __amount: amount,
        __createdAt: v.createdAt,
        actions: [{ key: 'view', icon: 'bi-eye-fill', label: 'View / Print', variant: 'primary' }],
      };
    });
  }

  newVoucher(type?: VoucherType): void {
    this.openDialog<VoucherForm, Voucher>(VoucherForm, { type: type ?? (this.view() === 'All' ? 'Receipt' : this.view()) }, '900px')
      .afterClosed().subscribe(v => { if (v && (v.type === 'Credit Note' || v.type === 'Debit Note')) this.openDialog(VoucherView, { voucherId: v.id }, '820px'); });
  }

  open(row: TableRow): void {
    this.openDialog(VoucherView, { voucherId: row['id'] }, '820px');
  }

  /** Voucher register (one row per voucher) + Tally-style entry-wise sheet (one row per Dr/Cr line). */
  exportExcel(): void {
    const ids = new Set(this.filteredRows.map(r => r['id']));
    const list = this.acc.vouchers().filter(v => ids.has(v.id)).sort((a, b) => a.date.localeCompare(b.date));
    const name = this.view() === 'All' ? 'vouchers' : this.view().toLowerCase().replace(' ', '-') + 's';
    downloadExcel(`${name}-${fileStamp()}`, [
      {
        name: 'Voucher Register',
        columns: [{ header: 'Date', key: 'date' }, { header: 'Voucher No', key: 'no' }, { header: 'Type', key: 'type' }, { header: 'Particulars', key: 'particulars' }, { header: 'Reference', key: 'ref' }, { header: 'Mode', key: 'mode' }, { header: 'Branch', key: 'branch' }, { header: 'Amount', key: 'amount' }, { header: 'Narration', key: 'narration' }],
        rows: list.map(v => ({ date: v.date, no: v.voucherNo, type: v.type, particulars: this.particulars(v), ref: v.reference ?? '', mode: v.mode ?? '', branch: v.branch, amount: voucherAmount(v), narration: v.narration })),
        totals: { date: 'TOTAL', amount: list.reduce((s, v) => s + voucherAmount(v), 0) },
      },
      {
        name: 'Entries (Dr-Cr)',
        columns: [{ header: 'Date', key: 'date' }, { header: 'Voucher No', key: 'no' }, { header: 'Type', key: 'type' }, { header: 'Ledger', key: 'ledger' }, { header: 'Group', key: 'group' }, { header: 'Debit', key: 'debit' }, { header: 'Credit', key: 'credit' }],
        rows: list.flatMap(v => v.entries.map(e => ({ date: v.date, no: v.voucherNo, type: v.type, ledger: this.acc.ledgerName(e.ledgerId), group: this.acc.ledger(e.ledgerId)?.group, debit: e.debit || '', credit: e.credit || '' }))),
        totals: { date: 'TOTAL', debit: list.reduce((s, v) => s + voucherAmount(v), 0), credit: list.reduce((s, v) => s + voucherAmount(v), 0) },
      },
    ]);
  }
}
