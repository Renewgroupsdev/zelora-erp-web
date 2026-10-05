import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { AccountsService } from '../../../../shared/common-services/accounts.service';
import { PAYMENT_MODES, billTotals, lineAmount } from '../../../../shared/models/accounts.model';
import { printDocument } from '../../../../shared/utils/export.util';
import { amountInWords, displayDate, isoDate } from '../../../../shared/utils/format.util';

@Component({
  selector: 'app-bill-view',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './bill-view.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', '../../../../shared/styles/erp-document.scss'],
})
export class BillView {
  private readonly dialogRef = inject(MatDialogRef<BillView>);
  private readonly data = inject<{ billId: string }>(MAT_DIALOG_DATA);
  readonly acc = inject(AccountsService);
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  readonly billId = signal(this.data.billId);
  readonly bill = computed(() => this.acc.bills().find(b => b.id === this.billId())!);
  readonly totals = computed(() => billTotals(this.bill().items));
  readonly balance = computed(() => this.totals().grandTotal - this.bill().paidAmount);
  readonly receipts = computed(() => this.acc.vouchers().filter(v => v.billId === this.billId() && v.type === 'Receipt'));
  readonly creditNote = computed(() => this.acc.vouchers().find(v => v.billId === this.billId() && v.type === 'Credit Note'));
  readonly linked = computed(() => {
    const b = this.bill();
    const id = b.convertedToId ?? b.convertedFromId;
    return id ? this.acc.bills().find(x => x.id === id) : undefined;
  });

  readonly line = lineAmount;
  readonly displayDate = displayDate;
  readonly amountInWords = amountInWords;

  /** HSN/SAC-wise tax summary, as printed on GST invoices. */
  readonly taxSummary = computed(() => {
    const map = new Map<string, { sac: string; rate: number; taxable: number; gst: number }>();
    for (const i of this.bill().items) {
      const key = `${i.sac}|${i.gstPercent}`;
      const l = lineAmount(i);
      const row = map.get(key) ?? { sac: i.sac, rate: i.gstPercent, taxable: 0, gst: 0 };
      row.taxable += l.taxable;
      row.gst += l.gst;
      map.set(key, row);
    }
    return [...map.values()];
  });

  downloadPdf(): void {
    printDocument(`${this.bill().kind === 'Proforma' ? 'Proforma' : 'Invoice'} ${this.bill().billNo}`, this.sheet().nativeElement.innerHTML);
  }

  markSent(): void {
    this.acc.markProformaSent(this.billId());
  }

  async convert(): Promise<void> {
    const ok = await Swal.fire({ icon: 'question', title: 'Convert to Service Bill?', text: `Creates a tax invoice dated today for ₹${this.totals().grandTotal.toLocaleString('en-IN')} and posts it to accounts.`, showCancelButton: true, confirmButtonText: 'Convert', confirmButtonColor: '#6C63FF' });
    if (!ok.isConfirmed) return;
    const result = this.acc.convertProforma(this.billId());
    if (typeof result === 'string') {
      Swal.fire({ icon: 'error', title: 'Cannot convert', text: result, confirmButtonColor: '#6C63FF' });
      return;
    }
    this.billId.set(result.id);
  }

  async collect(): Promise<void> {
    const due = this.balance();
    const result = await Swal.fire({
      title: `Collect payment · ${this.bill().billNo}`,
      html: `
        <p style="margin:0 0 8px">Balance due <strong>₹${due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></p>
        <input id="c-amt" type="number" min="1" max="${due}" class="swal2-input" value="${due}" style="width:100%;margin:6px 0">
        <select id="c-mode" class="swal2-select" style="width:100%;margin:6px 0">${PAYMENT_MODES.map(m => `<option>${m}</option>`).join('')}</select>
        <input id="c-date" type="date" class="swal2-input" value="${isoDate()}" max="${isoDate()}" style="width:100%;margin:6px 0">`,
      showCancelButton: true,
      confirmButtonText: 'Post receipt',
      confirmButtonColor: '#0f9d58',
      preConfirm: () => {
        const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
        const r = this.acc.collectPayment(this.billId(), Number(v('c-amt')), v('c-mode') as (typeof PAYMENT_MODES)[number], v('c-date'));
        if (typeof r === 'string') { Swal.showValidationMessage(r); return false; }
        return r;
      },
    });
    if (result.isConfirmed) Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Receipt ${result.value.voucherNo} posted`, showConfirmButton: false, timer: 2500 });
  }

  async cancel(): Promise<void> {
    const isProforma = this.bill().kind === 'Proforma';
    const { value: reason, isConfirmed } = await Swal.fire({
      icon: 'warning',
      title: `Cancel ${this.bill().billNo}?`,
      text: isProforma ? 'The quotation will be marked cancelled.' : 'A Credit Note reversing the sales entry will be posted today.',
      input: 'text',
      inputPlaceholder: 'Reason',
      inputValidator: v => (v?.trim() ? null : 'Give a reason'),
      showCancelButton: true,
      confirmButtonText: 'Cancel bill',
      confirmButtonColor: '#dc4c4c',
    });
    if (!isConfirmed) return;
    const result = this.acc.cancelBill(this.billId(), reason.trim());
    if (typeof result === 'string') Swal.fire({ icon: 'error', title: 'Cannot cancel', text: result, confirmButtonColor: '#6C63FF' });
  }

  close(): void {
    this.dialogRef.close();
  }
}
