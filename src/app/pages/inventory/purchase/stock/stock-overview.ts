import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { NotificationService } from '../../../../shared/common-services/notification.service';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, QuickAction, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { CENTRAL_STORE, LOW_STOCK_THRESHOLD, displayDate, inr } from '../../../../shared/models/purchase.model';
import { PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { StockTransferForm } from './stock-transfer-form/stock-transfer-form';

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
  { key: 'transferNo', header: 'Transfer No', width: '11%' },
  { key: 'fromStore', header: 'From', width: '12%' },
  { key: 'store', header: 'To', type: 'branch', width: '12%' },
  { key: 'product', header: 'Product', width: '18%' },
  { key: 'batchNo', header: 'Batch No', width: '10%' },
  { key: 'qty', header: 'Qty', width: '7%' },
  { key: 'transferredBy', header: 'By', width: '11%' },
  { key: 'transferredAt', header: 'Date', width: '9%' },
  { key: 'remarks', header: 'Remarks', width: '10%' },
];

/** Central store + branch store stock, batch-wise, with low-stock alerts and central -> branch transfers. */
@Component({
  selector: 'app-stock-overview',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './stock-overview.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class StockOverview extends PurchaseListBase {
  private readonly notifications = inject(NotificationService);
  protected readonly noun = 'records';
  readonly view = signal<'stock' | 'transfers'>('stock');
  readonly threshold = LOW_STOCK_THRESHOLD;

  override filters = [
    { key: 'status', label: 'Status', options: ['In Stock', 'Low Stock', 'Out of Stock'] },
    { key: 'branch', label: 'Store', options: this.purchase.stores, multiSelect: true },
  ];

  columns: TableColumn[] = STOCK_COLUMNS;
  override sortActive = 'storeTotal';
  override sortDirection: 'asc' | 'desc' = 'asc';

  readonly stats = computed<DetailCardData[]>(() => {
    const stock = this.purchase.stock();
    const units = (central: boolean) => stock.filter(b => (b.store === CENTRAL_STORE) === central).reduce((s, b) => s + b.qty, 0);
    return [
      { label: 'Central Store · Stock in Hand', value: units(true).toLocaleString(), icon: 'bi-building', iconVariant: 'primary' },
      { label: 'Branch Stores · Stock in Hand', value: units(false).toLocaleString(), icon: 'bi-shop', iconVariant: 'blue' },
      { label: `Low Stock (< ${LOW_STOCK_THRESHOLD})`, value: this.purchase.lowStock().length, icon: 'bi-exclamation-triangle', iconVariant: 'orange' },
      { label: 'Stock Transfers', value: this.purchase.transfers().length, icon: 'bi-arrow-left-right', iconVariant: 'green' },
    ];
  });

  setView(view: 'stock' | 'transfers'): void {
    this.view.set(view);
    this.columns = view === 'stock' ? STOCK_COLUMNS : TRANSFER_COLUMNS;
    this.sortActive = view === 'stock' ? 'storeTotal' : 'transferredAt';
    this.sortDirection = view === 'stock' ? 'asc' : 'desc';
    this.currentPage = 1;
    this.refresh();
  }

  protected allRows(): TableRow[] {
    if (this.view() === 'transfers') {
      return this.purchase.transfers().map(t => ({
        id: t.id,
        transferNo: t.transferNo,
        fromStore: t.fromStore,
        store: t.toStore,
        product: t.productName,
        batchNo: t.batchNo,
        qty: String(t.qty), __qty: t.qty,
        transferredBy: t.transferredBy,
        transferredAt: displayDate(t.transferredAt), __transferredAt: t.transferredAt,
        remarks: t.remarks || '-',
      }));
    }

    const stock = this.purchase.stock();
    return stock.map(b => {
      const total = this.purchase.storeQty(b.store, b.productId);
      const status = total <= 0 ? 'Out of Stock' : total < LOW_STOCK_THRESHOLD ? 'Low Stock' : 'In Stock';
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

  onQuickAction(event: { row: TableRow; action: string }): void {
    if (event.action === 'transfer') this.openTransfer(String(event.row['id']));
  }

  notifyBranchHead(): void {
    const low = this.purchase.lowStock();
    for (const item of low) {
      this.notifications.add({ type: 'stock', title: 'Low stock alert', message: `${item.productName} is running low at ${item.store} (${item.qty} units left).`, link: '/app/inventory/stock' });
    }
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Branch head notified', text: `${low.length} low-stock alert${low.length === 1 ? '' : 's'} sent.`, showConfirmButton: false, timer: 3000 });
  }
}
