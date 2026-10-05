import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, QuickAction, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { displayDate, inr, lineTotals } from '../../../../shared/models/purchase.model';
import { GoodsInwardForm } from '../goods-inward/goods-inward-form/goods-inward-form';
import { PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { PurchaseInvoice } from './purchase-invoice/purchase-invoice';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './purchase-orders.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class PurchaseOrders extends PurchaseListBase {
  protected readonly noun = 'purchase orders';

  override filters = [
    { key: 'status', label: 'Status', options: ['Ordered', 'Partially Received', 'Received'] },
    { key: 'branch', label: 'Branch', options: this.purchase.branches, multiSelect: true },
  ];

  columns: TableColumn[] = [
    { key: 'poNo', header: 'PO No', width: '10%' },
    { key: 'invoiceNo', header: 'Invoice No', width: '10%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '10%' },
    { key: 'vendor', header: 'Vendor', width: '15%' },
    { key: 'orderedAt', header: 'PO Date', width: '9%' },
    { key: 'expectedAt', header: 'Expected', width: '9%' },
    { key: 'amount', header: 'Amount', width: '10%' },
    { key: 'qty', header: 'Request / Received', width: '10%' },
    { key: 'status', header: 'Status', type: 'badge', width: '9%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '8%', sortable: false },
  ];

  override sortActive = 'orderedAt';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.purchase.orders();
    const count = (s: string) => list.filter(o => o.status === s).length;
    const value = list.reduce((sum, o) => sum + lineTotals(o.items).grandTotal, 0);
    return [
      { label: 'Purchase Orders', value: list.length, icon: 'bi-receipt', iconVariant: 'primary' },
      { label: 'Awaiting Delivery', value: count('Ordered'), icon: 'bi-truck', iconVariant: 'blue' },
      { label: 'Partially Received', value: count('Partially Received'), icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Total PO Value', value: inr(value), icon: 'bi-currency-rupee', iconVariant: 'green' },
    ];
  });

  protected allRows(): TableRow[] {
    return this.purchase.orders().map(o => {
      const total = lineTotals(o.items).grandTotal;
      const requested = o.items.reduce((s, i) => s + i.requestedQty, 0);
      const received = o.items.reduce((s, i) => s + i.receivedQty, 0);
      const actions: QuickAction[] = [{ key: 'invoice', icon: 'bi-file-earmark-pdf-fill', label: 'View PO / Invoice' }];
      if (o.status !== 'Received') actions.push({ key: 'inward', icon: 'bi-box-arrow-in-down', label: 'Purchase Inward', variant: 'primary' });
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
        qty: `${requested} / ${received}`,
        __qty: requested ? received / requested : 0,
        status: o.status,
        actions,
      };
    });
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    const orderId = String(event.row['id']);
    if (event.action === 'invoice') this.openDialog(PurchaseInvoice, { orderId }, '860px');
    if (event.action === 'inward') this.openDialog(GoodsInwardForm, { orderId }, '1100px');
  }
}
