import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { ModuleTabs } from '../../../shared/components/module-tabs/module-tabs';
import { DetailCardData, FilterOption, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { Bill, BillKind, billTotals } from '../../../shared/models/accounts.model';
import { downloadExcel, fileStamp } from '../../../shared/utils/export.util';
import { displayDate, inr, isoDate } from '../../../shared/utils/format.util';
import { AccountsListBase } from '../accounts-list-base';
import { BillForm } from './bill-form/bill-form';
import { BillView } from './bill-view/bill-view';

type View = 'Service' | 'Proforma';

@Component({
  selector: 'app-bills',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, ModuleTabs],
  templateUrl: './bills.html',
  styleUrl: '../../../shared/styles/erp-page.scss',
})
export class Bills extends AccountsListBase {
  protected readonly noun = 'bills';
  readonly view = signal<View>('Service');

  columns: TableColumn[] = [
    { key: 'billNo', header: 'Bill No', width: '12%' },
    { key: 'date', header: 'Date', width: '9%' },
    { key: 'customer', header: 'Customer', type: 'lead', width: '16%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '10%' },
    { key: 'items', header: 'Services', width: '15%' },
    { key: 'total', header: 'Bill Amount', width: '10%' },
    { key: 'received', header: 'Received', width: '9%' },
    { key: 'balance', header: 'Balance', width: '9%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '6%', sortable: false },
  ];

  override filters = this.filtersFor('Service');
  override sortActive = 'billNo';

  readonly stats = computed<DetailCardData[]>(() => {
    const today = isoDate();
    const service = this.acc.bills().filter(b => b.kind === 'Service' && b.status !== 'Cancelled');
    const todays = service.filter(b => b.date === today);
    const proformas = this.acc.bills().filter(b => b.kind === 'Proforma' && (b.status === 'Draft' || b.status === 'Sent'));
    const collected = this.acc.dayBook(today).receipts;
    return [
      { label: "Today's Billing", value: inr(todays.reduce((s, b) => s + billTotals(b.items).grandTotal, 0)), icon: 'bi-receipt', iconVariant: 'primary', trendText: `${todays.length} bills` },
      { label: "Today's Collection", value: inr(collected), icon: 'bi-cash-coin', iconVariant: 'green' },
      { label: 'Outstanding Receivables', value: inr(this.acc.receivables()), icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Open Proformas', value: inr(proformas.reduce((s, b) => s + billTotals(b.items).grandTotal, 0)), icon: 'bi-file-earmark-text', iconVariant: 'blue', trendText: `${proformas.length} quotes` },
    ];
  });

  private filtersFor(view: View): FilterOption[] {
    return [
      { key: 'status', label: 'Status', options: view === 'Service' ? ['Unpaid', 'Partially Paid', 'Paid', 'Cancelled'] : ['Draft', 'Sent', 'Converted', 'Cancelled'] },
      { key: 'branch', label: 'Branch', options: this.acc.branches, multiSelect: true },
      { key: 'date', label: 'Date' },
    ];
  }

  setView(view: View): void {
    this.view.set(view);
    this.filters = this.filtersFor(view);
    this.columns = this.columns.map(c => (c.key === 'balance' ? { ...c, header: view === 'Service' ? 'Balance' : 'Valid Till' } : c.key === 'received' ? { ...c, header: view === 'Service' ? 'Received' : 'Converted To' } : c));
    this.currentPage = 1;
    this.refresh();
  }

  protected allRows(): TableRow[] {
    const view = this.view();
    return this.acc.bills().filter(b => b.kind === view).map(b => this.toRow(b));
  }

  private toRow(b: Bill): TableRow {
    const t = billTotals(b.items);
    const balance = b.status === 'Cancelled' ? 0 : t.grandTotal - b.paidAmount;
    const converted = b.convertedToId ? this.acc.bills().find(x => x.id === b.convertedToId)?.billNo ?? '-' : '-';
    return {
      id: b.id,
      billNo: b.billNo,
      date: displayDate(b.date), __date: b.date,
      customer: { name: b.customerName, subtitle: b.customerPhone || b.customerGstin },
      __customer: b.customerName,
      searchText: `${b.customerName} ${b.customerPhone} ${b.customerGstin}`,
      branch: b.branch,
      items: b.items.map(i => i.description).join(', '),
      total: inr(t.grandTotal), __total: t.grandTotal,
      received: b.kind === 'Service' ? inr(b.paidAmount) : converted, __received: b.paidAmount,
      balance: b.kind === 'Service' ? inr(balance) : displayDate(b.dueDate), __balance: b.kind === 'Service' ? balance : b.dueDate ?? '',
      status: b.status,
      actions: [{ key: 'view', icon: 'bi-eye-fill', label: 'View / Print', variant: 'primary' }],
    };
  }

  newBill(kind: BillKind): void {
    this.openDialog<BillForm, Bill>(BillForm, { kind }, '1000px').afterClosed().subscribe(bill => {
      if (!bill) return;
      if (bill.kind !== this.view()) this.setView(bill.kind);
      this.openDialog(BillView, { billId: bill.id }, '920px');
    });
  }

  open(row: TableRow): void {
    this.openDialog(BillView, { billId: row['id'] }, '920px');
  }

  /** Bill register with one row per bill + a second sheet with every line item. */
  exportExcel(): void {
    const ids = new Set(this.filteredRows.map(r => r['id']));
    const bills = this.acc.bills().filter(b => ids.has(b.id));
    const rows = bills.map(b => {
      const t = billTotals(b.items);
      return { billNo: b.billNo, kind: b.kind, date: b.date, customer: b.customerName, phone: b.customerPhone, gstin: b.customerGstin, branch: b.branch,
        taxable: t.taxable, cgst: t.gst / 2, sgst: t.gst / 2, roundOff: t.roundOff, total: t.grandTotal, received: b.paidAmount,
        balance: b.kind === 'Service' && b.status !== 'Cancelled' ? t.grandTotal - b.paidAmount : 0, status: b.status };
    });
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    downloadExcel(`${this.view().toLowerCase()}-bills-${fileStamp()}`, [
      {
        name: `${this.view()} Bills`,
        columns: [
          { header: 'Bill No', key: 'billNo' }, { header: 'Type', key: 'kind' }, { header: 'Date', key: 'date' }, { header: 'Customer', key: 'customer' }, { header: 'Mobile', key: 'phone' },
          { header: 'GSTIN', key: 'gstin' }, { header: 'Branch', key: 'branch' }, { header: 'Taxable', key: 'taxable' }, { header: 'CGST', key: 'cgst' }, { header: 'SGST', key: 'sgst' },
          { header: 'Round Off', key: 'roundOff' }, { header: 'Total', key: 'total' }, { header: 'Received', key: 'received' }, { header: 'Balance', key: 'balance' }, { header: 'Status', key: 'status' },
        ],
        rows,
        totals: { billNo: 'TOTAL', taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), roundOff: sum('roundOff'), total: sum('total'), received: sum('received'), balance: sum('balance') },
      },
      {
        name: 'Line Items',
        columns: [{ header: 'Bill No', key: 'billNo' }, { header: 'Description', key: 'description' }, { header: 'SAC/HSN', key: 'sac' }, { header: 'Qty', key: 'qty' }, { header: 'Rate', key: 'rate' }, { header: 'Disc %', key: 'discountPercent' }, { header: 'GST %', key: 'gstPercent' }],
        rows: bills.flatMap(b => b.items.map(i => ({ billNo: b.billNo, ...i }))),
      },
    ]);
  }
}
