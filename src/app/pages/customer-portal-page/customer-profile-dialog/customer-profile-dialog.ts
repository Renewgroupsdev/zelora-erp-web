import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Customer } from '../customer.model';
import { PaymentStatus } from '../../../shared/data/treatment-catalog';

export interface CustomerProfileDialogData {
  customer: Customer;
}

export interface CustomerProfileDialogResult {
  action: 'book';
  customer: Customer;
}

@Component({
  selector: 'app-customer-profile-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './customer-profile-dialog.html',
  styleUrl: './customer-profile-dialog.scss',
})
export class CustomerProfileDialog {
  constructor(
    private dialogRef: MatDialogRef<CustomerProfileDialog, CustomerProfileDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: CustomerProfileDialogData,
  ) { }

  get customer(): Customer {
    return this.data.customer;
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  segmentClass(segment: string): string {
    const map: Record<string, string> = { Regular: 'status-green', New: 'status-gray' };
    return map[segment] ?? 'status-gray';
  }

  statusClass(status: string): string {
    return status === 'Active' ? 'status-green' : 'status-gray';
  }

  paymentStatusClass(status: PaymentStatus): string {
    const map: Record<PaymentStatus, string> = { Paid: 'status-green', Partial: 'status-orange', Pending: 'status-gray' };
    return map[status];
  }

  paymentMethodIcon(method: string): string {
    const map: Record<string, string> = { Cash: 'bi-cash-stack', Card: 'bi-credit-card-2-front', UPI: 'bi-phone', Wallet: 'bi-wallet2' };
    return map[method] ?? 'bi-cash-stack';
  }

  formatCurrency(value: number): string {
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
  }

  /** Sum of amount still owed across every recorded visit (Partial/Pending payments). */
  get outstandingBalance(): number {
    return this.customer.visitHistory.reduce((sum, visit) => sum + Math.max(0, visit.amount - visit.amountPaid), 0);
  }

  formatDate(iso: string): string {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  close(): void {
    this.dialogRef.close();
  }

  bookAppointment(): void {
    this.dialogRef.close({ action: 'book', customer: this.customer });
  }
}
