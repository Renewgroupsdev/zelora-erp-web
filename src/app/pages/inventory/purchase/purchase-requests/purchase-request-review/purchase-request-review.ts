import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE, PurchaseOrder, displayDate, lineTotals } from '../../../../../shared/models/purchase.model';

export interface ReviewResult {
  action: 'approved' | 'rejected';
  order?: PurchaseOrder;
}

/** Branch head view of a purchase request: details, stock on hand, approve (-> PO + invoice) or reject. */
@Component({
  selector: 'app-purchase-request-review',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './purchase-request-review.html',
  styleUrl: '../../../../../shared/styles/erp-dialog.scss',
})
export class PurchaseRequestReview {
  private readonly dialogRef = inject(MatDialogRef<PurchaseRequestReview, ReviewResult>);
  private readonly data = inject<{ requestId: string }>(MAT_DIALOG_DATA);
  readonly purchase = inject(PurchaseService);

  readonly request = computed(() => this.purchase.requests().find(r => r.id === this.data.requestId)!);
  readonly totals = computed(() => lineTotals(this.request().items));
  readonly canReview = computed(() => this.request().status === 'Pending' && this.purchase.canApprove());
  readonly displayDate = displayDate;

  remarks = '';
  expectedAt: string | null = null;
  readonly remarksError = signal(false);
  readonly today = new Date().toISOString().slice(0, 10);

  centralQty(productId: string): number {
    return this.purchase.storeQty(CENTRAL_STORE, productId);
  }

  branchQty(productId: string): number {
    return this.purchase.storeQty(this.request().branch, productId);
  }

  statusClass(): string {
    return { Pending: 'orange', Approved: 'green', Rejected: 'red' }[this.request().status];
  }

  approve(): void {
    const order = this.purchase.approveRequest(this.request().id, this.remarks.trim(), this.expectedAt);
    if (order) this.dialogRef.close({ action: 'approved', order });
  }

  reject(): void {
    if (!this.remarks.trim()) {
      this.remarksError.set(true);
      return;
    }
    this.purchase.rejectRequest(this.request().id, this.remarks.trim());
    this.dialogRef.close({ action: 'rejected' });
  }

  close(): void {
    this.dialogRef.close();
  }
}
