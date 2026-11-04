import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { PriceRevision, RevisionLine, displayDate } from '../../../../../shared/models/purchase.model';

/**
 * Vendor side of a purchase order: where its invoice was sent (e-mail / WhatsApp, with a re-send), and what to do when the vendor
 * changes a price after the PO. The revised proforma is uploaded here and goes to the admin; accepting it moves the product prices
 * in the product master (written to the product price history) and the PO lines.
 */
@Component({
  selector: 'app-purchase-order-revision',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './purchase-order-revision.html',
  styleUrl: '../../../../../shared/styles/erp-dialog.scss',
})
export class PurchaseOrderRevision {
  private readonly dialogRef = inject(MatDialogRef<PurchaseOrderRevision, boolean>);
  private readonly data = inject<{ orderId: string }>(MAT_DIALOG_DATA);
  readonly purchase = inject(PurchaseService);

  readonly order = computed(() => this.purchase.orders().find(o => o.id === this.data.orderId)!);
  readonly displayDate = displayDate;
  readonly today = new Date().toISOString().slice(0, 10);

  readonly revisions = signal<PriceRevision[]>([]);
  readonly lines = signal<RevisionLine[]>([]);
  readonly canSubmit = signal(false);
  readonly canReview = signal(false);
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly fileName = signal('');
  readonly error = signal('');
  readonly hasPending = computed(() => this.revisions().some(r => r.status === 'Pending'));

  form = { quoteNo: '', quoteDate: this.today, remarks: '', prices: {} as Record<string, number | null> };
  private file: File | null = null;
  private changed = false;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const res = await this.purchase.poRevisions(this.data.orderId);
    this.revisions.set(res.items);
    this.lines.set(res.lines);
    this.canSubmit.set(res.canSubmit);
    this.canReview.set(res.canReview);
    this.loading.set(false);
  }

  async resend(): Promise<void> {
    if (this.sending()) return;
    this.sending.set(true);
    const deliveries = await this.purchase.sendOrderToVendor(this.data.orderId);
    this.sending.set(false);
    if (deliveries) this.purchase.announceDeliveries(this.order().poNo, this.order().vendorName, deliveries);
  }

  openForm(): void {
    this.showForm.set(true);
    this.form = { quoteNo: '', quoteDate: this.today, remarks: '', prices: Object.fromEntries(this.lines().map(l => [l.productId, l.unitPrice])) };
    this.file = null;
    this.fileName.set('');
    this.error.set('');
  }

  /** Editable name of the picked proforma (without the extension); the file is uploaded under this name. */
  fileBase = '';
  fileExt = '';

  onFile(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.fileName.set(this.file?.name ?? '');
    const dot = this.file ? this.file.name.lastIndexOf('.') : -1;
    this.fileBase = this.file ? (dot > 0 ? this.file.name.slice(0, dot) : this.file.name) : '';
    this.fileExt = this.file && dot > 0 ? this.file.name.slice(dot) : '';
  }

  private uploadName(): string {
    const base = this.fileBase.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'revised-proforma';
    return base + this.fileExt;
  }

  /** Lines whose price the vendor changed. */
  changedLines(): RevisionLine[] {
    return this.lines().filter(l => {
      const v = this.form.prices[l.productId];
      return v !== null && v !== undefined && String(v) !== '' && Math.round(Number(v) * 100) !== Math.round(l.unitPrice * 100);
    });
  }

  async submit(): Promise<void> {
    if (!this.form.quoteNo.trim()) return void this.error.set("Enter the vendor's revised quote number.");
    if (!this.file) return void this.error.set("Attach the vendor's revised proforma quote.");
    const changed = this.changedLines();
    if (!changed.length) return void this.error.set('Change at least one product price to the vendor\'s new price.');
    this.error.set('');

    const body = new FormData();
    body.append('quote_no', this.form.quoteNo.trim());
    body.append('quote_date', this.form.quoteDate);
    if (this.form.remarks.trim()) body.append('remarks', this.form.remarks.trim());
    body.append('items', JSON.stringify(changed.map(l => ({ product_id: Number(l.productId), new_price: Number(this.form.prices[l.productId]) }))));
    body.append('file', this.file, this.uploadName());

    this.saving.set(true);
    const ok = await this.purchase.addPoRevision(this.data.orderId, body);
    this.saving.set(false);
    if (!ok) return;
    this.showForm.set(false);
    await this.load();
  }

  async accept(r: PriceRevision): Promise<void> {
    const confirm = await Swal.fire({
      icon: 'question', title: 'Accept the revised prices?', showCancelButton: true, confirmButtonText: 'Yes, update prices', confirmButtonColor: '#065f46',
      html: `${r.items.length} product price${r.items.length === 1 ? '' : 's'} in the product master and on this purchase order will change to the vendor's new price. Each change is saved in the product price history.`,
    });
    if (!confirm.isConfirmed) return;
    if (await this.purchase.acceptRevision(r.id)) {
      this.changed = true;
      await this.load();
    }
  }

  async reject(r: PriceRevision): Promise<void> {
    const res = await Swal.fire({
      title: 'Reject the revised quote?', input: 'text', inputPlaceholder: 'Reason (required)', showCancelButton: true,
      confirmButtonText: 'Reject', confirmButtonColor: '#c2362b', inputValidator: v => (v?.trim() ? null : 'Enter a reason'),
    });
    if (!res.isConfirmed) return;
    if (await this.purchase.rejectRevision(r.id, String(res.value).trim())) await this.load();
  }

  viewFile(r: PriceRevision): void {
    this.purchase.openProforma(`price-revisions/${r.id}/file`);
  }

  close(): void {
    this.dialogRef.close(this.changed);
  }
}
