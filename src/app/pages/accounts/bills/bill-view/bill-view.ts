import { CommonModule } from '@angular/common';
import { CanActionDirective } from '../../../../shared/directives/can-action.directive';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { AccountsService } from '../../../../shared/common-services/accounts.service';
import { RecordHistory } from '../../../../shared/components/record-history/record-history';
import { PageLoader } from '../../../../shared/components/page-loader/page-loader';
import { ApiDataService } from '../../../../core/http/api.service';
import { ToastService } from '../../../../shared/common-services/toast.service';
import { PAYMENT_MODES, billLabel, isProductBill, billTotals, lineAmount } from '../../../../shared/models/accounts.model';
import { printDocument } from '../../../../shared/utils/export.util';
import { amountInWords, displayDate, isoDate } from '../../../../shared/utils/format.util';

@Component({
  selector: 'app-bill-view',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CanActionDirective, RecordHistory, PageLoader],
  templateUrl: './bill-view.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', '../../../../shared/styles/erp-document.scss'],
})
export class BillView {
  private readonly dialogRef = inject(MatDialogRef<BillView>);
  private readonly data = inject<{ billId: string }>(MAT_DIALOG_DATA);
  readonly acc = inject(AccountsService);
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
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

  readonly billLabel = billLabel;
  // Product bills preview the server PDF (the very document that is downloaded); it reloads when the bill is paid / changed.
  private readonly sanitizer = inject(DomSanitizer);
  readonly pdfUrl = signal<SafeResourceUrl | null>(null);
  readonly pdfLoading = signal(false);
  private pdfBlobUrl: string | null = null;
  private readonly previewPdf = effect(() => {
    const b = this.bill();
    if (!b || !isProductBill(b)) return;
    void [b.status, b.paidAmount];
    untracked(() => this.loadPdfPreview());
  });
  private readonly cleanup = inject(DestroyRef).onDestroy(() => { if (this.pdfBlobUrl) URL.revokeObjectURL(this.pdfBlobUrl); });

  private loadPdfPreview(): void {
    this.pdfLoading.set(true);
    this.api.GET_BLOB(`accounts/bills/${this.billId()}/pdf`).subscribe({
      next: (blob: Blob) => {
        if (this.pdfBlobUrl) URL.revokeObjectURL(this.pdfBlobUrl);
        this.pdfBlobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfBlobUrl));
        this.pdfLoading.set(false);
      },
      // Preview unavailable (no download-bill-pdf permission, server error): the on-screen sheet below stays visible.
      error: () => { this.pdfUrl.set(null); this.pdfLoading.set(false); },
    });
  }

  readonly line = lineAmount;
  readonly displayDate = displayDate;
  readonly amountInWords = amountInWords;

  /** SAC-wise tax summary, as printed on GST invoices. */
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

  /** Product bills: the server builds the PDF in the company frame (same layout as the payment receipt). */
  downloadPdf(): void {
    if (isProductBill(this.bill())) return this.openServerPdf();

    printDocument(`${this.bill().kind === 'Proforma' ? 'Proforma' : 'Invoice'} ${this.bill().billNo}`, this.sheet().nativeElement.innerHTML);
  }

  private openServerPdf(): void {
    const tab = window.open('', '_blank');
    this.api.GET_BLOB(`accounts/bills/${this.billId()}/pdf`).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        tab?.close();
        this.toast.error('Could not open the bill PDF.');
      },
    });
  }

  async markSent(): Promise<void> {
    await this.acc.markProformaSent(this.billId());
  }

  async convert(): Promise<void> {
    const ok = await Swal.fire({ icon: 'question', title: 'Convert to Service Bill?', text: `Creates a tax invoice dated today for ₹${this.totals().grandTotal.toLocaleString('en-IN')} and posts it to accounts.`, showCancelButton: true, confirmButtonText: 'Convert', confirmButtonColor: '#6C63FF' });
    if (!ok.isConfirmed) return;
    const result = await this.acc.convertProforma(this.billId());
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
      preConfirm: async () => {
        const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
        const r = await this.acc.collectPayment(this.billId(), Number(v('c-amt')), v('c-mode') as (typeof PAYMENT_MODES)[number], v('c-date'));
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
    const result = await this.acc.cancelBill(this.billId(), reason.trim());
    if (typeof result === 'string') Swal.fire({ icon: 'error', title: 'Cannot cancel', text: result, confirmButtonColor: '#6C63FF' });
  }

  close(): void {
    this.dialogRef.close();
  }
}
