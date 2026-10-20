import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, FilterOption, QuickAction, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { displayDate, inr } from '../../../../shared/models/purchase.model';
import { PurchaseCollection, PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { StockTransferForm } from './stock-transfer-form/stock-transfer-form';
import { StockTransferReceive } from './stock-transfer-receive/stock-transfer-receive';
import { CanActionDirective } from '../../../../shared/directives/can-action.directive';

const STOCK_COLUMNS: TableColumn[] = [
  { key: 'store', header: 'Store', type: 'branch', width: '13%' },
  { key: 'code', header: 'Code', width: '9%' },
  { key: 'product', header: 'Product', width: '19%' },
  { key: 'batchNo', header: 'Batch No', width: '11%' },
  { key: 'expiryDate', header: 'Expiry', width: '10%' },
  { key: 'qty', header: 'Batch Qty', width: '8%' },
  { key: 'storeTotal', header: 'Store Total', width: '8%' },
  { key: 'value', header: 'Stock Value', width: '10%' },
  { key: 'status', header: 'Status', type: 'badge', width: '8%' },
  { key: 'actions', header: 'Action', type: 'quickActions', width: '6%', sortable: false },
];

const TRANSFER_COLUMNS: TableColumn[] = [
  { key: 'transferNo', header: 'Transfer No', width: '10%' },
  { key: 'kind', header: 'Type', width: '7%' },
  { key: 'fromStore', header: 'From', width: '11%' },
  { key: 'store', header: 'To', type: 'branch', width: '11%' },
  { key: 'product', header: 'Products · Batches', width: '18%' },
  { key: 'qty', header: 'Sent', width: '5%' },
  { key: 'accepted', header: 'Accepted', width: '6%' },
  { key: 'rejected', header: 'Rejected', width: '6%' },
  { key: 'pending', header: 'In Transit', width: '6%' },
  { key: 'transferredAt', header: 'Date', width: '8%' },
  { key: 'status', header: 'Status', type: 'badge', width: '7%' },
  { key: 'actions', header: 'Action', type: 'quickActions', width: '5%', sortable: false },
];

/** Central store + branch store stock, batch-wise, with low-stock alerts and central -> branch transfers. */
@Component({
  selector: 'app-stock-overview',
  standalone: true,
  imports: [CanActionDirective, CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './stock-overview.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class StockOverview extends PurchaseListBase {
  protected readonly noun = 'records';
  protected readonly collections: PurchaseCollection[] = ['stock', 'transfers'];
  readonly view = signal<'stock' | 'transfers'>('stock');
  readonly threshold = this.purchase.threshold;

  readonly pageFilters = computed<FilterOption[]>(() => [
    {
      key: 'status', label: 'Status',
      options: this.view() === 'stock' ? ['In Stock', 'Low Stock', 'Out of Stock'] : ['In Transit', 'Partially Received', 'Received', 'Cancelled'],
    },
    { key: 'branch', label: 'Store', options: this.purchase.stores(), multiSelect: true },
  ]);

  columns: TableColumn[] = STOCK_COLUMNS;
  override sortActive = 'storeTotal';
  override sortDirection: 'asc' | 'desc' = 'asc';

  readonly stats = computed<DetailCardData[]>(() => {
    const s = this.purchase.summaries().stock ?? {};
    const n = (key: string) => Number(s[key]) || 0;
    return [
      { label: 'Central Store · Stock in Hand', value: n('central_units').toLocaleString(), icon: 'bi-building', iconVariant: 'primary' },
      { label: 'Branch Stores · Stock in Hand', value: n('branch_units').toLocaleString(), icon: 'bi-shop', iconVariant: 'blue' },
      { label: `Low Stock (< ${this.threshold()})`, value: n('low_stock'), icon: 'bi-exclamation-triangle', iconVariant: 'orange' },
      { label: 'In Transit (awaiting accept)', value: `${n('transfers_open')} · ${n('in_transit_units')} units`, icon: 'bi-truck', iconVariant: 'green' },
    ];
  });

  setView(view: 'stock' | 'transfers'): void {
    this.view.set(view);
    // Status options differ per view; the filter card is re-created too, so both start clean.
    this.filterState = { status: null, source: null, branch: [], telecaller: null, dateFrom: null, dateTo: null };
    this.searchTerm = '';
    this.columns = view === 'stock' ? STOCK_COLUMNS : TRANSFER_COLUMNS;
    this.sortActive = view === 'stock' ? 'storeTotal' : 'transferredAt';
    this.sortDirection = view === 'stock' ? 'asc' : 'desc';
    this.currentPage = 1;
    this.refresh();
  }

  protected allRows(): TableRow[] {
    if (this.view() === 'transfers') {
      return this.purchase.transfers().map(t => {
        const actions: QuickAction[] = [];
        if (t.canReceive) actions.push({ key: 'receive', icon: 'bi-box-arrow-in-down', label: 'Accept / Reject', variant: 'primary' });
        else actions.push({ key: 'view', icon: 'bi-eye-fill', label: `View ${t.kind}` });
        if (t.canCancel) actions.push({ key: 'cancel-transfer', icon: 'bi-x-circle', label: `Cancel ${t.kind}`, variant: 'danger' });
        actions.push({ key: 'print', icon: 'bi-printer', label: 'Re-print (PDF)', permission: 'download-stock-transfer' });
        return {
          id: t.id,
          transferNo: t.transferNo,
          kind: t.kind,
          fromStore: t.fromStore,
          store: t.toStore,
          product: t.lines.map(l => `${l.productName} · ${l.batchNo}`).join(', '),
          qty: String(t.qty), __qty: t.qty,
          accepted: String(t.acceptedQty), __accepted: t.acceptedQty,
          rejected: String(t.rejectedQty), __rejected: t.rejectedQty,
          pending: String(t.pendingQty), __pending: t.pendingQty,
          transferredAt: displayDate(t.transferredAt), __transferredAt: t.transferredAt,
          __date: t.transferredAt,
          status: t.status,
          searchText: `${t.transferNo} ${t.fromStore} ${t.toStore} ${t.transferredBy} ${t.remarks} ${t.lines.map(l => `${l.productName} ${l.batchNo}`).join(' ')}`,
          actions,
        };
      });
    }

    const stock = this.purchase.stock();
    return stock.map(b => {
      const total = this.purchase.storeQtyByKey(b.storeKey, b.productId);
      const status = total <= 0 ? 'Out of Stock' : total < this.threshold() ? 'Low Stock' : 'In Stock';
      const actions: QuickAction[] = b.qty > 0 ? [{ key: 'transfer', icon: 'bi-arrow-left-right', label: 'Transfer stock', variant: 'primary' }] : [];
      return {
        id: b.id,
        store: b.store,
        code: b.productCode || '-',
        product: b.productName,
        batchNo: b.batchNo,
        expiryDate: displayDate(b.expiryDate), __expiryDate: b.expiryDate ?? '',
        qty: String(b.qty), __qty: b.qty,
        storeTotal: String(total), __storeTotal: total,
        value: inr(b.qty * b.unitPrice), __value: b.qty * b.unitPrice,
        status,
        actions,
      };
    });
  }

  openTransfer(batchId?: string): void {
    this.openDialog(StockTransferForm, batchId ? { batchId } : null, '640px');
  }

  async onQuickAction(event: { row: TableRow; action: string }): Promise<void> {
    const id = String(event.row['id']);
    if (event.action === 'transfer') {
      this.openTransfer(id);
      return;
    }
    const transfer = this.purchase.transfers().find(t => t.id === id);
    if (!transfer) return;
    switch (event.action) {
      case 'receive':
      case 'view':
        this.openDialog(StockTransferReceive, { transferId: id }, '1000px');
        break;
      case 'print':
        void this.purchase.openPdf('stock-transfer', id);
        break;
      case 'cancel-transfer': {
        const reason = await this.purchase.askReason(`Cancel ${transfer.transferNo}?`, `${transfer.qty} unit(s) go back to ${transfer.fromStore}.`, `Cancel ${transfer.kind}`);
        if (reason) await this.purchase.cancelTransfer(id, reason);
        break;
      }
    }
  }

  async notifyBranchHead(): Promise<void> {
    await this.purchase.notifyLowStock();
  }
}
