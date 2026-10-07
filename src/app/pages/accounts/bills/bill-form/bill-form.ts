import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AccountsService, BILL_CATALOG } from '../../../../shared/common-services/accounts.service';
import { HrService } from '../../../../shared/common-services/hr.service';
import { isTreatmentStaff } from '../../../../shared/models/targets.model';
import { Bill, BillItem, BillKind, PAYMENT_MODES, PaymentMode, billTotals, lineAmount } from '../../../../shared/models/accounts.model';
import { addDays, isoDate } from '../../../../shared/utils/format.util';

/** Proforma (quotation - no accounting) or Service bill (posts Sales voucher, optional instant collection). */
@Component({
  selector: 'app-bill-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './bill-form.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './bill-form.scss'],
})
export class BillForm {
  private readonly dialogRef = inject(MatDialogRef<BillForm, Bill>);
  private readonly data = inject<{ kind: BillKind }>(MAT_DIALOG_DATA);
  readonly acc = inject(AccountsService);

  private readonly hr = inject(HrService);
  /** Treatment staff of the selected branch - the person the sale is credited to. */
  readonly sellers = () => this.hr.activeEmployees().filter(e => isTreatmentStaff(e) && e.branch === this.branch);

  readonly catalog = BILL_CATALOG;
  readonly modes = PAYMENT_MODES;
  readonly gstRates = [0, 5, 12, 18, 28];
  readonly today = isoDate();
  readonly kind = signal<BillKind>(this.data.kind);
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);

  date = this.today;
  dueDate: string | null = addDays(this.today, this.data.kind === 'Proforma' ? 15 : 7);
  branch = this.acc.branches[0];
  employeeId = '';
  customerName = '';
  customerPhone = '';
  customerAddress = '';
  customerGstin = '';
  notes = '';
  items: BillItem[] = [this.blankItem()];
  collectNow = true;
  collectAmount: number | null = null;
  collectMode: PaymentMode = 'UPI';

  private blankItem(): BillItem {
    return { description: '', sac: '999722', qty: 1, rate: 0, discountPercent: 0, gstPercent: 18 };
  }

  setKind(kind: BillKind): void {
    this.kind.set(kind);
    this.dueDate = addDays(this.date, kind === 'Proforma' ? 15 : 7);
  }

  /** Picking a catalog name fills SAC, rate, discount and GST. */
  onDescription(item: BillItem): void {
    const hit = this.catalog.find(c => c.description === item.description);
    if (hit) Object.assign(item, { ...hit, qty: item.qty || 1 });
  }

  addItem(): void {
    this.items = [...this.items, this.blankItem()];
  }

  removeItem(i: number): void {
    if (this.items.length > 1) this.items = this.items.filter((_, x) => x !== i);
  }

  line(item: BillItem) {
    return lineAmount(item);
  }

  totals() {
    return billTotals(this.items);
  }

  /** Customers seen before (Sundry Debtors), for the name autocomplete. */
  customers() {
    return this.acc.ledgersIn(['Sundry Debtors']);
  }

  onCustomer(): void {
    const hit = this.customers().find(c => c.name === this.customerName);
    if (hit) {
      this.customerPhone ||= hit.phone ?? '';
      this.customerAddress ||= hit.address ?? '';
      this.customerGstin ||= hit.gstin ?? '';
    }
  }

  error(): string | null {
    if (!this.customerName.trim()) return 'Enter the customer name.';
    if (this.customerPhone && !/^[6-9]\d{9}$/.test(this.customerPhone)) return 'Enter a valid 10-digit mobile.';
    if (this.customerGstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(this.customerGstin.toUpperCase())) return 'GSTIN format looks wrong.';
    if (this.items.some(i => !i.description.trim())) return 'Every line needs a description.';
    if (this.items.some(i => !(i.qty > 0) || i.rate < 0)) return 'Quantity must be above 0 and rate cannot be negative.';
    if (this.items.some(i => i.discountPercent < 0 || i.discountPercent > 100)) return 'Discount must be 0-100%.';
    if (!this.totals().grandTotal) return 'Bill total is zero.';
    if (this.kind() === 'Service' && this.collectNow) {
      const amt = this.collectAmount ?? this.totals().grandTotal;
      if (amt <= 0 || amt > this.totals().grandTotal) return 'Collected amount must be between ₹1 and the bill total.';
    }
    return null;
  }

  save(): void {
    this.submitted.set(true);
    this.serverError.set(null);
    if (this.error()) return;
    const result = this.acc.createBill(
      {
        kind: this.kind(), date: this.date, dueDate: this.dueDate, branch: this.branch, employeeId: this.employeeId || undefined, notes: this.notes.trim(),
        customerName: this.customerName.trim(), customerPhone: this.customerPhone.trim(), customerAddress: this.customerAddress.trim(),
        customerGstin: this.customerGstin.trim().toUpperCase(),
        items: this.items.map(i => ({ ...i, description: i.description.trim(), qty: Number(i.qty), rate: Number(i.rate), discountPercent: Number(i.discountPercent), gstPercent: Number(i.gstPercent) })),
      },
      this.kind() === 'Service' && this.collectNow ? { amount: Number(this.collectAmount ?? this.totals().grandTotal), mode: this.collectMode } : null,
    );
    if (typeof result === 'string') {
      this.serverError.set(result);
      return;
    }
    this.dialogRef.close(result);
  }

  close(): void {
    this.dialogRef.close();
  }
}
