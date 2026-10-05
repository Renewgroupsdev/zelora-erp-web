import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { CASH_GROUPS, Voucher, voucherAmount } from '../../../shared/models/accounts.model';
import { downloadExcel } from '../../../shared/utils/export.util';
import { addDays, displayDate, inr, isoDate } from '../../../shared/utils/format.util';
import { AccountsListBase } from '../accounts-list-base';
import { BillForm } from '../bills/bill-form/bill-form';
import { VoucherForm } from '../vouchers/voucher-form/voucher-form';
import { VoucherView } from '../vouchers/voucher-view/voucher-view';

const DAY_COLUMNS: TableColumn[] = [
  { key: 'time', header: 'Time', width: '7%' },
  { key: 'voucherNo', header: 'Voucher No', width: '13%' },
  { key: 'status', header: 'Type', type: 'badge', width: '9%' },
  { key: 'particulars', header: 'Particulars', width: '24%' },
  { key: 'mode', header: 'Mode', width: '8%' },
  { key: 'branch', header: 'Branch', type: 'branch', width: '10%' },
  { key: 'inflow', header: 'Cash/Bank In (Dr)', width: '11%' },
  { key: 'outflow', header: 'Cash/Bank Out (Cr)', width: '11%' },
  { key: 'actions', header: '', type: 'quickActions', width: '5%', sortable: false },
];

const HISTORY_COLUMNS: TableColumn[] = [
  { key: 'date', header: 'Date', width: '14%' },
  { key: 'opening', header: 'Opening Balance', width: '15%' },
  { key: 'receipts', header: 'Total Collection', width: '15%' },
  { key: 'payments', header: 'Payments', width: '14%' },
  { key: 'closing', header: 'Closing Balance', width: '15%' },
  { key: 'vouchers', header: 'Vouchers', width: '8%' },
  { key: 'status', header: 'Day Status', type: 'badge', width: '9%' },
  { key: 'actions', header: '', type: 'quickActions', width: '6%', sortable: false },
];

@Component({
  selector: 'app-day-book',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, CommonTableCard, ModuleTabs],
  templateUrl: './day-book.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', './day-book.scss'],
})
export class DayBook extends AccountsListBase {
  protected readonly noun = 'entries';
  readonly today = isoDate();
  readonly date = signal(this.today);
  readonly view = signal<'day' | 'history'>('day');
  readonly displayDate = displayDate;
  readonly inr = inr;

  columns: TableColumn[] = DAY_COLUMNS;
  override sortActive = '';

  readonly book = computed(() => this.acc.dayBook(this.date()));
  readonly prevDay = computed(() => addDays(this.date(), -1));
  readonly nextDay = computed(() => addDays(this.date(), 1));
  readonly previousOpen = computed(() => {
    const prev = this.lastOpenDayBefore(this.date());
    return prev && prev !== this.date() ? prev : null;
  });
  readonly modes = computed(() => Object.entries(this.book().byMode).sort((a, b) => b[1] - a[1]));
  readonly branchesSplit = computed(() => Object.entries(this.book().byBranch).sort((a, b) => b[1] - a[1]));

  private lastOpenDayBefore(date: string): string | null {
    const dates = [...new Set(this.acc.vouchers().filter(v => v.date < date).map(v => v.date))].sort();
    return dates.reverse().find(d => !this.acc.isClosed(d)) ?? null;
  }

  shift(days: number): void {
    const next = addDays(this.date(), days);
    if (next <= this.today) this.setDate(next);
  }

  setDate(value: string): void {
    if (!value) return;
    this.date.set(value);
    this.view.set('day');
    this.columns = DAY_COLUMNS;
    this.currentPage = 1;
  }

  setView(view: 'day' | 'history'): void {
    this.view.set(view);
    this.columns = view === 'day' ? DAY_COLUMNS : HISTORY_COLUMNS;
    this.currentPage = 1;
    this.refresh();
  }

  private cashSide(v: Voucher): { inflow: number; outflow: number } {
    const cash = v.entries.filter(e => CASH_GROUPS.includes(this.acc.ledger(e.ledgerId)?.group ?? 'Capital Account'));
    return { inflow: cash.reduce((s, e) => s + e.debit, 0), outflow: cash.reduce((s, e) => s + e.credit, 0) };
  }

  private particulars(v: Voucher): string {
    const other = v.entries.filter(e => !CASH_GROUPS.includes(this.acc.ledger(e.ledgerId)?.group ?? 'Capital Account'));
    const list = (other.length ? other : v.entries).map(e => this.acc.ledgerName(e.ledgerId));
    return `${list[0]}${list.length > 1 ? ` +${list.length - 1}` : ''}${v.narration ? ` - ${v.narration}` : ''}`;
  }

  protected allRows(): TableRow[] {
    if (this.view() === 'history') {
      const dates = new Set(this.acc.vouchers().map(v => v.date));
      for (let i = 0; i < 14; i++) dates.add(addDays(this.today, -i));
      return [...dates].filter(d => d <= this.today).sort().reverse().slice(0, 45).map(d => {
        const b = this.acc.dayBook(d);
        return {
          id: d,
          date: displayDate(d), __date: d,
          opening: inr(b.opening), __opening: b.opening,
          receipts: inr(b.receipts), __receipts: b.receipts,
          payments: inr(b.payments), __payments: b.payments,
          closing: inr(b.closing), __closing: b.closing,
          vouchers: String(b.vouchers.length), __vouchers: b.vouchers.length,
          status: b.closed ? 'Closed' : 'Open',
          actions: [{ key: 'open', icon: 'bi-box-arrow-up-right', label: 'Open day', variant: 'primary' }],
        };
      });
    }

    return this.book().vouchers.map(v => {
      const { inflow, outflow } = this.cashSide(v);
      const contra = v.type === 'Contra';
      return {
        id: v.id,
        time: new Date(v.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        voucherNo: v.voucherNo,
        status: v.type,
        particulars: this.particulars(v),
        mode: v.mode ?? (contra ? 'Contra' : '-'),
        branch: v.branch,
        inflow: inflow && !contra ? inr(inflow) : contra ? `(${inr(inflow)})` : '-', __inflow: contra ? 0 : inflow,
        outflow: outflow && !contra ? inr(outflow) : contra ? `(${inr(outflow)})` : '-', __outflow: contra ? 0 : outflow,
        actions: [{ key: 'view', icon: 'bi-eye-fill', label: 'View voucher' }],
      };
    });
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    if (event.action === 'open') this.setDate(String(event.row['id']));
    if (event.action === 'view') this.openDialog(VoucherView, { voucherId: event.row['id'] }, '820px');
  }

  newVoucher(): void {
    this.openDialog(VoucherForm, { type: 'Receipt' }, '900px');
  }

  newBill(): void {
    this.openDialog(BillForm, { kind: 'Service' }, '1000px');
  }

  async closeDay(): Promise<void> {
    const b = this.book();
    const prevOpen = this.previousOpen();
    const ok = await Swal.fire({
      icon: 'question',
      title: `Close ${displayDate(b.date)}?`,
      html: `
        <table style="width:100%;font-size:14px;text-align:left">
          <tr><td>Opening balance</td><td style="text-align:right">${inr(b.opening)}</td></tr>
          <tr><td>+ Total collection</td><td style="text-align:right;color:#0f9d58">${inr(b.receipts)}</td></tr>
          <tr><td>− Payments</td><td style="text-align:right;color:#d0392c">${inr(b.payments)}</td></tr>
          <tr><td><strong>Closing balance</strong></td><td style="text-align:right"><strong>${inr(b.closing)}</strong></td></tr>
        </table>
        <p style="margin-top:10px;font-size:13px">Closing ${inr(b.closing)} becomes the opening balance of ${displayDate(addDays(b.date, 1))}. No more entries can be posted to this day.</p>
        ${prevOpen ? `<p style="color:#c47c14;font-size:13px">⚠ ${displayDate(prevOpen)} is still open.</p>` : ''}`,
      showCancelButton: true,
      confirmButtonText: 'Close day',
      confirmButtonColor: '#6C63FF',
    });
    if (!ok.isConfirmed) return;
    if (this.acc.closeDay(b.date)) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Day closed', text: `${inr(b.closing)} carried forward`, showConfirmButton: false, timer: 3000 });
    }
  }

  async reopenDay(): Promise<void> {
    const ok = await this.confirm(`Reopen ${displayDate(this.date())}?`, 'Entries can be posted again. Close it again once corrections are done.');
    if (ok) this.acc.reopenDay(this.date());
  }

  private async confirm(title: string, text: string): Promise<boolean> {
    const r = await Swal.fire({ icon: 'warning', title, text, showCancelButton: true, confirmButtonText: 'Reopen', confirmButtonColor: '#dc4c4c' });
    return r.isConfirmed;
  }

  exportExcel(): void {
    if (this.view() === 'history') {
      downloadExcel(`cash-book-${this.today}`, [this.exportSheet('Cash Book')]);
      return;
    }
    const b = this.book();
    downloadExcel(`day-book-${b.date}`, [
      {
        name: `Day Book ${b.date}`,
        columns: [{ header: 'Voucher No', key: 'no' }, { header: 'Type', key: 'type' }, { header: 'Ledger', key: 'ledger' }, { header: 'Debit', key: 'debit' }, { header: 'Credit', key: 'credit' }, { header: 'Mode', key: 'mode' }, { header: 'Branch', key: 'branch' }, { header: 'Narration', key: 'narration' }],
        rows: b.vouchers.flatMap(v => v.entries.map((e, i) => ({ no: i ? '' : v.voucherNo, type: i ? '' : v.type, ledger: this.acc.ledgerName(e.ledgerId), debit: e.debit || '', credit: e.credit || '', mode: i ? '' : v.mode ?? '', branch: i ? '' : v.branch, narration: i ? '' : v.narration }))),
        totals: { no: 'TOTAL', debit: b.vouchers.reduce((s, v) => s + voucherAmount(v), 0), credit: b.vouchers.reduce((s, v) => s + voucherAmount(v), 0) },
      },
      {
        name: 'Cash Summary',
        columns: [{ header: 'Particulars', key: 'label' }, { header: 'Amount', key: 'amount' }],
        rows: [
          { label: 'Opening Balance (Cash + Bank)', amount: b.opening },
          { label: 'Total Collection', amount: b.receipts },
          ...Object.entries(b.byMode).map(([m, a]) => ({ label: `   ${m}`, amount: a })),
          { label: 'Payments', amount: b.payments },
          { label: 'Closing Balance', amount: b.closing },
          { label: '   Cash in hand', amount: b.cashClosing },
          { label: '   Bank', amount: b.bankClosing },
          { label: `Status`, amount: b.closed ? `Closed by ${b.closed.closedBy}` : 'Open' },
        ],
      },
    ]);
  }
}
