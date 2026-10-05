import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CENTRAL_STORE, displayDate, lineTotals } from '../../../../../shared/models/purchase.model';

/** Print stylesheet for the PDF window - the dialog's own styles don't travel with the HTML. */
const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: 'Rubik', Arial, sans-serif; color: #163b35; font-size: 12px; }
  .inv-head { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 3px solid #138a6b; }
  .inv-brand h1 { margin: 0; font-size: 20px; color: #0f6e55; } .inv-brand p, .inv-meta p { margin: 2px 0; color: #6a837d; }
  .inv-meta { text-align: right; } .inv-meta h2 { margin: 0 0 4px; font-size: 16px; letter-spacing: 1px; }
  .inv-parties { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 14px 0; }
  .inv-parties small { display: block; color: #6a837d; text-transform: uppercase; font-size: 9px; letter-spacing: .6px; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; } th { background: #eaf6f1; text-align: left; font-size: 10px; padding: 7px; }
  td { padding: 7px; border-bottom: 1px solid #dfe9e6; } .num { text-align: right; }
  .inv-totals { width: 260px; margin: 12px 0 0 auto; } .inv-totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .inv-totals .grand { border-top: 2px solid #138a6b; margin-top: 4px; padding-top: 6px; font-weight: 700; font-size: 14px; }
  .inv-words { margin-top: 10px; color: #6a837d; } .inv-sign { display: flex; justify-content: space-between; margin-top: 48px; }
  .inv-sign span { border-top: 1px solid #9fb3ad; padding-top: 4px; min-width: 160px; text-align: center; }
  .inv-footer { margin-top: 24px; text-align: center; color: #9fb3ad; font-size: 10px; }
`;

@Component({
  selector: 'app-purchase-invoice',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './purchase-invoice.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', './purchase-invoice.scss'],
})
export class PurchaseInvoice {
  private readonly dialogRef = inject(MatDialogRef<PurchaseInvoice>);
  private readonly data = inject<{ orderId: string }>(MAT_DIALOG_DATA);
  private readonly purchase = inject(PurchaseService);
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  readonly order = computed(() => this.purchase.orders().find(o => o.id === this.data.orderId)!);
  readonly totals = computed(() => lineTotals(this.order().items));
  readonly displayDate = displayDate;
  readonly centralStore = CENTRAL_STORE;

  /** Opens the invoice in a clean window and triggers print - choose "Save as PDF" to download. */
  downloadPdf(): void {
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>${this.order().invoiceNo}</title><style>${PRINT_CSS}</style></head><body>${this.sheet().nativeElement.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 250);
  }

  amountInWords(value: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (n: number): string => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim());
    const three = (n: number): string => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred ${two(n % 100)}` : two(n)).trim();

    let n = Math.round(value);
    if (!n) return 'Zero Rupees Only';
    const parts: string[] = [];
    for (const [size, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']] as const) {
      if (n >= size) {
        parts.push(`${three(Math.floor(n / size))} ${label}`);
        n %= size;
      }
    }
    if (n) parts.push(three(n));
    return `${parts.join(' ')} Rupees Only`;
  }

  close(): void {
    this.dialogRef.close();
  }
}
