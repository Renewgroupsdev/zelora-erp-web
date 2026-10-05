import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { displayDate, inr } from '../../../../shared/models/purchase.model';
import { PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { GoodsInwardForm } from './goods-inward-form/goods-inward-form';

const GRN_COLUMNS: TableColumn[] = [
  { key: 'grnNo', header: 'GRN No', width: '10%' },
  { key: 'poNo', header: 'PO No', width: '10%' },
  { key: 'vendor', header: 'Vendor', width: '14%' },
  { key: 'store', header: 'Received Into', type: 'branch', width: '11%' },
  { key: 'vendorInvoiceNo', header: 'Vendor Inv.', width: '9%' },
  { key: 'batches', header: 'Batches', width: '12%' },
  { key: 'received', header: 'Received', width: '7%' },
  { key: 'damaged', header: 'Damaged', width: '7%' },
  { key: 'status', header: 'Receipt', type: 'badge', width: '7%' },
  { key: 'receivedAt', header: 'Date', width: '9%' },
];

const BATCH_COLUMNS: TableColumn[] = [
  { key: 'grnNo', header: 'GRN No', width: '10%' },
  { key: 'product', header: 'Product', width: '16%' },
  { key: 'batchNo', header: 'Batch No', width: '10%' },
  { key: 'mfgDate', header: 'MFG', width: '9%' },
  { key: 'expiryDate', header: 'Expiry', width: '9%' },
  { key: 'ordered', header: 'Request Qty', width: '8%' },
  { key: 'received', header: 'Received Qty', width: '8%' },
  { key: 'damaged', header: 'Damaged', width: '7%' },
  { key: 'accepted', header: 'Available Qty', width: '8%' },
  { key: 'value', header: 'Value', width: '9%' },
  { key: 'store', header: 'Store', type: 'branch', width: '10%' },
];

@Component({
  selector: 'app-goods-inward',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './goods-inward.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class GoodsInward extends PurchaseListBase {
  protected readonly noun = 'entries';
  readonly view = signal<'grn' | 'batch'>('grn');

  override filters = [
    { key: 'status', label: 'Receipt', options: ['Full', 'Partial'] },
    { key: 'branch', label: 'Store', options: this.purchase.stores, multiSelect: true },
  ];

  columns: TableColumn[] = GRN_COLUMNS;
  override sortActive = 'receivedAt';

  readonly openOrders = computed(() => this.purchase.orders().filter(o => o.status !== 'Received'));

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.purchase.inwards();
    const lines = list.flatMap(g => g.lines);
    return [
      { label: 'Goods Receipts', value: list.length, icon: 'bi-box-arrow-in-down', iconVariant: 'primary' },
      { label: 'Batches Received', value: lines.length, icon: 'bi-upc-scan', iconVariant: 'blue' },
      { label: 'Partial Receipts', value: list.filter(g => g.isPartial).length, icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Damaged Units', value: lines.reduce((s, l) => s + l.damagedQty, 0), icon: 'bi-x-octagon', iconVariant: 'purple' },
    ];
  });

  setView(view: 'grn' | 'batch'): void {
    this.view.set(view);
    this.columns = view === 'grn' ? GRN_COLUMNS : BATCH_COLUMNS;
    this.currentPage = 1;
    this.refresh();
  }

  protected allRows(): TableRow[] {
    const inwards = this.purchase.inwards();
    if (this.view() === 'batch') {
      return inwards.flatMap(g => g.lines.map((l, i) => ({
        id: `${g.id}-${i}`,
        grnNo: g.grnNo,
        product: l.productName,
        batchNo: l.batchNo,
        mfgDate: displayDate(l.mfgDate),
        __mfgDate: l.mfgDate ?? '',
        expiryDate: displayDate(l.expiryDate),
        __expiryDate: l.expiryDate ?? '',
        ordered: String(l.orderedQty), __ordered: l.orderedQty,
        received: String(l.receivedQty), __received: l.receivedQty,
        damaged: String(l.damagedQty), __damaged: l.damagedQty,
        accepted: String(l.receivedQty - l.damagedQty), __accepted: l.receivedQty - l.damagedQty,
        value: inr((l.receivedQty - l.damagedQty) * l.unitPrice), __value: (l.receivedQty - l.damagedQty) * l.unitPrice,
        store: g.store,
        status: g.isPartial ? 'Partial' : 'Full',
        __receivedAt: g.receivedAt,
      })));
    }

    return inwards.map(g => {
      const received = g.lines.reduce((s, l) => s + l.receivedQty, 0);
      const damaged = g.lines.reduce((s, l) => s + l.damagedQty, 0);
      return {
        id: g.id,
        grnNo: g.grnNo,
        poNo: g.poNo,
        vendor: g.vendorName,
        store: g.store,
        vendorInvoiceNo: g.vendorInvoiceNo,
        batches: g.lines.map(l => l.batchNo).join(', '),
        received: String(received), __received: received,
        damaged: String(damaged), __damaged: damaged,
        status: g.isPartial ? 'Partial' : 'Full',
        receivedAt: displayDate(g.receivedAt),
        __receivedAt: g.receivedAt,
      };
    });
  }

  async receiveGoods(): Promise<void> {
    const orders = this.openOrders();
    if (!orders.length) {
      Swal.fire({ icon: 'info', title: 'No open purchase orders', text: 'Every purchase order is fully received.', confirmButtonColor: '#6C63FF' });
      return;
    }

    const { value: orderId } = await Swal.fire({
      title: 'Select purchase order',
      input: 'select',
      inputOptions: Object.fromEntries(orders.map(o => [o.id, `${o.poNo} · ${o.vendorName} (${o.status})`])),
      inputPlaceholder: 'Choose a PO to receive against',
      showCancelButton: true,
      confirmButtonText: 'Continue',
      confirmButtonColor: '#6C63FF',
      inputValidator: v => (v ? null : 'Select a purchase order'),
    });
    if (orderId) this.openDialog(GoodsInwardForm, { orderId }, '1100px');
  }
}
