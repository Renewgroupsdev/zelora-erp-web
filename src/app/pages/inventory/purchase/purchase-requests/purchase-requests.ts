import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, QuickAction, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { displayDate, inr, lineTotals } from '../../../../shared/models/purchase.model';
import { PurchaseInvoice } from '../purchase-orders/purchase-invoice/purchase-invoice';
import { PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { PurchaseRequestForm } from './purchase-request-form/purchase-request-form';
import { PurchaseRequestReview, ReviewResult } from './purchase-request-review/purchase-request-review';

@Component({
  selector: 'app-purchase-requests',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './purchase-requests.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class PurchaseRequests extends PurchaseListBase {
  protected readonly noun = 'requests';

  override filters = [
    { key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected'] },
    { key: 'branch', label: 'Branch', options: this.purchase.branches, multiSelect: true },
  ];

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

  override sortActive = 'requestedAt';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.purchase.requests();
    const count = (s: string) => list.filter(r => r.status === s).length;
    return [
      { label: 'Total Requests', value: list.length, icon: 'bi-cart3', iconVariant: 'primary' },
      { label: 'Pending Approval', value: count('Pending'), icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Approved', value: count('Approved'), icon: 'bi-check2-circle', iconVariant: 'green' },
      { label: 'Rejected', value: count('Rejected'), icon: 'bi-x-circle', iconVariant: 'purple' },
    ];
  });

  protected allRows(): TableRow[] {
    const canApprove = this.purchase.canApprove();
    return this.purchase.requests().map(r => {
      const total = lineTotals(r.items).grandTotal;
      const actions: QuickAction[] = [{ key: 'view', icon: 'bi-eye-fill', label: 'View details' }];
      if (r.status === 'Pending' && canApprove) actions.push({ key: 'review', icon: 'bi-check2-square', label: 'Approve / Reject', variant: 'primary' });
      if (r.poId) actions.push({ key: 'invoice', icon: 'bi-file-earmark-pdf-fill', label: 'View PO / Invoice' });
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

    if (event.action === 'invoice' && request.poId) {
      this.openDialog(PurchaseInvoice, { orderId: request.poId }, '860px');
      return;
    }

    this.openDialog<PurchaseRequestReview, ReviewResult>(PurchaseRequestReview, { requestId: request.id })
      .afterClosed()
      .subscribe(result => {
        // Approving confirms the PO - show the generated invoice straight away.
        if (result?.action === 'approved' && result.order) this.openDialog(PurchaseInvoice, { orderId: result.order.id }, '860px');
      });
  }
}
