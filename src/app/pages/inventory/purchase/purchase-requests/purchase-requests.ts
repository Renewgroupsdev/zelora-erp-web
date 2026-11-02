import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, FilterOption, QuickAction, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { displayDate, inr, lineTotals } from '../../../../shared/models/purchase.model';
import { PurchaseInvoice } from '../purchase-orders/purchase-invoice/purchase-invoice';
import { PurchaseCollection, PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { PurchaseRequestForm } from './purchase-request-form/purchase-request-form';
import { PurchaseRequestReview, ReviewResult } from './purchase-request-review/purchase-request-review';
import { CanActionDirective } from '../../../../shared/directives/can-action.directive';

@Component({
  selector: 'app-purchase-requests',
  standalone: true,
  imports: [CanActionDirective, CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './purchase-requests.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class PurchaseRequests extends PurchaseListBase {
  protected readonly noun = 'requests';
  protected readonly collections: PurchaseCollection[] = ['requests'];

  readonly pageFilters = computed<FilterOption[]>(() => [
    { key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected'] },
    { key: 'branch', label: 'Branch', options: this.purchase.branches(), multiSelect: true },
  ]);

  columns: TableColumn[] = [
    { key: 'requestNo', header: 'Request No', width: '11%' },
    { key: 'branch', header: 'Branch', type: 'branch', width: '11%' },
    { key: 'vendor', header: 'Vendor', width: '15%' },
    { key: 'items', header: 'Items', width: '6%' },
    { key: 'amount', header: 'Est. Amount', width: '10%' },
    { key: 'requestedBy', header: 'Requested By', width: '11%' },
    { key: 'requestedAt', header: 'Requested On', width: '10%' },
    { key: 'priority', header: 'Priority', type: 'badge', width: '7%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '11%', sortable: false },
  ];

  override sortActive = ''; // API order = updated_at desc: new / edited rows lead

  readonly stats = computed<DetailCardData[]>(() => {
    const s = this.purchase.summaries().requests ?? {};
    const n = (key: string) => Number(s[key]) || 0;
    return [
      { label: 'Total Requests', value: n('total'), icon: 'bi-cart3', iconVariant: 'primary' },
      { label: 'Pending Approval', value: n('pending'), icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Approved', value: n('approved'), icon: 'bi-check2-circle', iconVariant: 'green' },
      { label: 'Rejected', value: n('rejected'), icon: 'bi-x-circle', iconVariant: 'purple' },
    ];
  });

  protected allRows(): TableRow[] {
    const canApprove = this.purchase.canApprove();
    return this.purchase.requests().map(r => {
      const total = lineTotals(r.items).grandTotal;
      const actions: QuickAction[] = [{ key: 'view', icon: 'bi-eye-fill', label: 'View details' }];
      if (r.status === 'Pending' && canApprove) actions.push({ key: 'review', icon: 'bi-check2-square', label: 'Approve / Reject', variant: 'primary' });
      actions.push({ key: 'pdf', icon: 'bi-file-earmark-pdf-fill', label: 'Print request (PDF)', permission: 'download-purchase-request' });
      return {
        id: r.id,
        requestNo: r.requestNo,
        branch: r.branch,
        vendor: r.vendorName,
        items: String(r.items.length),
        __items: r.items.length,
        amount: inr(total),
        __amount: total,
        requestedBy: r.requestedBy,
        requestedAt: displayDate(r.requestedAt),
        __requestedAt: r.requestedAt,
        priority: r.priority,
        status: r.status,
        actions,
      };
    });
  }

  openNewRequest(): void {
    this.openDialog(PurchaseRequestForm, null, '860px');
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    const request = this.purchase.requests().find(r => r.id === event.row['id']);
    if (!request) return;

    if (event.action === 'pdf') {
      void this.purchase.openPdf('purchase-request', request.id);
      return;
    }

    this.openDialog<PurchaseRequestReview, ReviewResult>(PurchaseRequestReview, { requestId: request.id })
      .afterClosed()
      .subscribe(result => {
        // Approving confirms the PO - show the generated invoice straight away.
        if (result?.action === 'approved' && result.order) void this.openInvoice(result.order.id);
      });
  }

  /** The invoice reads the PO from the orders list, which this tab does not load - fetch it first. */
  private async openInvoice(orderId: string): Promise<void> {
    await this.purchase.reload('orders');
    if (this.purchase.orders().some(o => o.id === orderId)) this.openDialog(PurchaseInvoice, { orderId }, '860px');
  }
}
