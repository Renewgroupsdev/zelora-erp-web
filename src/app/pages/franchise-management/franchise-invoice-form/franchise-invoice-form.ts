import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ToastService } from '../../../shared/common-services/toast.service';
import { FranchiseInvoiceRow, FranchiseService, apiError } from '../../../shared/common-services/franchise.service';
import { splitShare } from '../../../shared/models/branch-franchise.model';
import { inr, isoDate } from '../../../shared/utils/format.util';

interface Line { name: string; qty: number; unitPrice: number; }

/** Raise an invoice for a franchise partner. The API splits it between the partner and Renew at the share in force that day. */
@Component({
  selector: 'app-franchise-invoice-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './franchise-invoice-form.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', '../../../shared/styles/branch-franchise-dialog.scss'],
})
export class FranchiseInvoiceForm {
  private readonly dialogRef = inject(MatDialogRef<FranchiseInvoiceForm, FranchiseInvoiceRow>);
  private readonly data = inject<{ franchiseId: string; franchiseName: string; sharePercent: number }>(MAT_DIALOG_DATA);
  private readonly store = inject(FranchiseService);
  private readonly toast = inject(ToastService);

  readonly franchiseName = this.data.franchiseName;
  readonly sharePercent = this.data.sharePercent;
  readonly today = isoDate();
  readonly inr = inr;
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly serverError = signal<string | null>(null);

  customer = '';
  customerPhone = '';
  date = isoDate();
  status: 'Paid' | 'Unpaid' = 'Unpaid';
  notes = '';
  readonly lines = signal<Line[]>([{ name: '', qty: 1, unitPrice: 0 }]);

  /** Lines are edited in place by ngModel, so these are read on every change-detection pass (not signals). */
  total(): number {
    return this.lines().reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  }

  /** Preview only - the server splits with the share in force on the invoice date. */
  split() {
    return splitShare(this.total(), this.sharePercent);
  }

  addLine(): void {
    this.lines.update(l => [...l, { name: '', qty: 1, unitPrice: 0 }]);
  }

  removeLine(index: number): void {
    this.lines.update(l => (l.length > 1 ? l.filter((_, i) => i !== index) : l));
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    this.serverError.set(null);
    const items = this.lines().map(l => ({ name: l.name.trim(), qty: Math.floor(Number(l.qty)), unitPrice: Number(l.unitPrice) }));
    if (form.invalid || this.saving() || items.some(i => !i.name || !(i.qty >= 1) || !(i.unitPrice >= 0))) return;

    this.saving.set(true);
    this.store.addInvoice(this.data.franchiseId, {
      customer: this.customer.trim(), customerPhone: this.customerPhone.trim(), date: this.date, status: this.status, notes: this.notes.trim(), items,
    }).subscribe({
      next: invoice => { this.saving.set(false); this.dialogRef.close(invoice); },
      error: err => { this.saving.set(false); this.toast.error(apiError(err, 'Failed to raise invoice. Please try again.')); },
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
