import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, FilterOption, QuickAction, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { displayDate, inr } from '../../../../shared/models/purchase.model';
import { PurchaseCollection, PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { GoodsInwardForm } from './goods-inward-form/goods-inward-form';
import { CanActionDirective } from '../../../../shared/directives/can-action.directive';

const GRN_COLUMNS: TableColumn[] = [
  { key: 'grnNo', header: 'GRN No', width: '10%' },
  { key: 'poNo', header: 'PO No', width: '10%' },
  { key: 'vendor', header: 'Vendor', width: '14%' },
  { key: 'store', header: 'Received Into', type: 'branch', width: '11%' },
  { key: 'vendorInvoiceNo', header: 'Bill No', width: '8%' },
  { key: 'batches', header: 'Batches', width: '11%' },
  { key: 'received', header: 'Received', width: '6%' },
  { key: 'damaged', header: 'Damaged', width: '6%' },
  { key: 'netAmount', header: 'Bill Amount', width: '8%' },
  { key: 'status', header: 'Receipt', type: 'badge', width: '7%' },
  { key: 'receivedAt', header: 'Date', width: '8%' },
  { key: 'actions', header: 'Action', type: 'quickActions', width: '7%', sortable: false },
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
  { key: 'accepted', header: 'Accepted', width: '7%' },
  { key: 'free', header: 'Free', width: '5%' },
  { key: 'value', header: 'Value', width: '9%' },
  { key: 'store', header: 'Store', type: 'branch', width: '10%' },
];

@Component({
  selector: 'app-goods-inward',
  standalone: true,
  imports: [CanActionDirective, CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './goods-inward.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class GoodsInward extends PurchaseListBase {
  protected readonly noun = 'entries';
  protected readonly collections: PurchaseCollection[] = ['inwards', 'orders'];
  readonly view = signal<'grn' | 'batch'>('grn');

  readonly pageFilters = computed<FilterOption[]>(() => [
    { key: 'status', label: 'Receipt', options: ['Full', 'Partial', 'Cancelled'] },
    { key: 'branch', label: 'Store', options: this.purchase.stores(), multiSelect: true },
  ]);

  columns: TableColumn[] = GRN_COLUMNS;
  override sortActive = ''; // API order = updated_at desc: new / edited rows lead

  readonly openOrders = computed(() => this.purchase.orders().filter(o => o.canInward));

  readonly stats = computed<DetailCardData[]>(() => {
    const s = this.purchase.summaries().inwards ?? {};
    const n = (key: string) => Number(s[key]) || 0;
    return [
      { label: 'Goods Receipts', value: n('receipts'), icon: 'bi-box-arrow-in-down', iconVariant: 'primary' },
      { label: 'Batches Received', value: n('batches'), icon: 'bi-upc-scan', iconVariant: 'blue' },
      { label: 'Partial Receipts', value: n('partial_receipts'), icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Bill Value', value: inr(n('bill_value')), icon: 'bi-currency-rupee', iconVariant: 'purple' },
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
        free: String(l.freeQty), __free: l.freeQty,
        value: inr(l.lineTotal), __value: l.lineTotal,
        store: g.store,
        status: receiptStatus(g),
        __receivedAt: g.receivedAt,
        __date: g.receivedAt,
      })));
    }

    return inwards.map(g => {
      const received = g.lines.reduce((s, l) => s + l.receivedQty, 0);
      const damaged = g.lines.reduce((s, l) => s + l.damagedQty, 0);
      const actions: QuickAction[] = [{ key: 'pdf', icon: 'bi-file-earmark-pdf-fill', label: 'GRN (PDF)', permission: 'download-goods-inward' }];
      if (g.canCancel) actions.push({ key: 'cancel', icon: 'bi-x-circle', label: 'Cancel Inward', variant: 'danger' });
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
        netAmount: inr(g.netAmount), __netAmount: g.netAmount,
        status: receiptStatus(g),
        receivedAt: displayDate(g.receivedAt),
        __receivedAt: g.receivedAt,
        __date: g.receivedAt,
        searchText: `${g.grnNo} ${g.poNo} ${g.vendorName} ${g.vendorInvoiceNo} ${g.lines.map(l => `${l.productName} ${l.batchNo}`).join(' ')}`,
        actions,
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
    if (orderId) this.openDialog(GoodsInwardForm, { orderId }, '1240px');
  }

  async onQuickAction(event: { row: TableRow; action: string }): Promise<void> {
    const inward = this.purchase.inwards().find(g => g.id === String(event.row['id']));
    if (!inward) return;
    if (event.action === 'pdf') {
      void this.purchase.openPdf('goods-inward', inward.id);
      return;
    }
    if (event.action === 'cancel') {
      const reason = await this.purchase.askReason(`Cancel ${inward.grnNo}?`,
        `Its units are taken back out of ${inward.store} and re-opened on ${inward.poNo}. Not possible once they were returned, transferred or used.`, 'Cancel Inward');
      if (reason) await this.purchase.cancelInward(inward.id, reason);
    }
  }
}

/** Full / Partial for a posted GRN, else Cancelled. */
function receiptStatus(g: { status: string; isPartial: boolean }): string {
  return g.status === 'Cancelled' ? 'Cancelled' : g.isPartial ? 'Partial' : 'Full';
}
