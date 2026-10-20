import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, FilterOption, QuickAction, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { displayDate, inr, lineTotals } from '../../../../shared/models/purchase.model';
import { GoodsInwardForm } from '../goods-inward/goods-inward-form/goods-inward-form';
import { PurchaseCollection, PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { PurchaseOrderEdit } from './purchase-order-edit/purchase-order-edit';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './purchase-orders.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class PurchaseOrders extends PurchaseListBase {
  protected readonly noun = 'purchase orders';
  protected readonly collections: PurchaseCollection[] = ['orders'];

  readonly pageFilters = computed<FilterOption[]>(() => [
    { key: 'status', label: 'Status', options: ['Ordered', 'Partially Received', 'Received', 'Closed', 'Cancelled'] },
    { key: 'branch', label: 'Branch', options: this.purchase.branches(), multiSelect: true },
  ]);

  columns: TableColumn[] = [
    { key: 'poNo', header: 'PO No', width: '10%' },
    { key: 'invoiceNo', header: 'Invoice No', width: '10%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '10%' },
    { key: 'vendor', header: 'Vendor', width: '15%' },
    { key: 'orderedAt', header: 'PO Date', width: '9%' },
    { key: 'expectedAt', header: 'Expected', width: '9%' },
    { key: 'amount', header: 'Amount', width: '10%' },
    { key: 'qty', header: 'Ordered / Received / Pending', width: '12%' },
    { key: 'status', header: 'Status', type: 'badge', width: '9%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '8%', sortable: false },
  ];

  override sortActive = 'orderedAt';

  readonly stats = computed<DetailCardData[]>(() => {
    const s = this.purchase.summaries().orders ?? {};
    const n = (key: string) => Number(s[key]) || 0;
    return [
      { label: 'Purchase Orders', value: n('total'), icon: 'bi-receipt', iconVariant: 'primary' },
      { label: 'Awaiting Delivery', value: n('awaiting_delivery'), icon: 'bi-truck', iconVariant: 'blue' },
      { label: 'Partially Received', value: n('partially_received'), icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Total PO Value', value: inr(n('total_value')), icon: 'bi-currency-rupee', iconVariant: 'green' },
    ];
  });

  protected allRows(): TableRow[] {
    return this.purchase.orders().map(o => {
      const total = lineTotals(o.items).grandTotal;
      const requested = o.items.reduce((s, i) => s + i.requestedQty, 0);
      const received = o.items.reduce((s, i) => s + i.receivedQty, 0);
      const pending = o.items.reduce((s, i) => s + (i.pendingQty ?? 0), 0);
      // Same actions as the reference PO worklist, shown only when the server says they are allowed.
      const actions: QuickAction[] = [
        { key: 'pdf', icon: 'bi-file-earmark-pdf-fill', label: 'Tax invoice (PDF)' },
      ];
      if (o.canInward) actions.push({ key: 'inward', icon: 'bi-box-arrow-in-down', label: 'Add PO Inward Entries', variant: 'primary' });
      if (o.canEdit) actions.push({ key: 'edit', icon: 'bi-pencil-square', label: o.canEditQty ? 'Edit PO' : 'Change expected date' });
      if (o.canClose) actions.push({ key: 'close', icon: 'bi-slash-circle', label: 'Close PO (write off pending)', variant: 'danger' });
      if (o.canCancel) actions.push({ key: 'cancel', icon: 'bi-x-circle', label: 'Cancel PO', variant: 'danger' });
      return {
        id: o.id,
        poNo: o.poNo,
        invoiceNo: o.invoiceNo,
        branch: o.branch,
        vendor: o.vendorName,
        orderedAt: displayDate(o.orderedAt),
        __orderedAt: o.orderedAt,
        expectedAt: displayDate(o.expectedAt),
        __expectedAt: o.expectedAt ?? '',
        amount: inr(total),
        __amount: total,
        qty: `${requested} / ${received} / ${pending}`,
        __qty: requested ? received / requested : 0,
        status: o.status,
        searchText: `${o.poNo} ${o.invoiceNo} ${o.vendorName} ${o.requestNo} ${o.closeReason ?? ''}`,
        actions,
      };
    });
  }

  async onQuickAction(event: { row: TableRow; action: string }): Promise<void> {
    const orderId = String(event.row['id']);
    const order = this.purchase.orders().find(o => o.id === orderId);
    if (!order) return;

    switch (event.action) {
      case 'pdf': void this.purchase.openPdf('purchase-order', orderId); break;
      case 'inward': this.openDialog(GoodsInwardForm, { orderId }, '1240px'); break;
      case 'edit': this.openDialog(PurchaseOrderEdit, { orderId }, '820px'); break;
      case 'cancel': {
        const reason = await this.purchase.askReason(`Cancel ${order.poNo}?`, 'Nothing has been received against this PO. It will be cancelled and cannot be received any more.', 'Cancel PO');
        if (reason) await this.purchase.cancelOrder(orderId, reason);
        break;
      }
      case 'close': {
        const pending = order.items.reduce((s, i) => s + (i.pendingQty ?? 0), 0);
        const reason = await this.purchase.askReason(`Close ${order.poNo}?`, `${pending} pending unit(s) will no longer be expected from ${order.vendorName}. Received stock is not affected.`, 'Close PO');
        if (reason) await this.purchase.closeOrder(orderId, reason);
        break;
      }
    }
  }
}
