import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { CanActionDirective } from '../../../../../shared/directives/can-action.directive';

/**
 * Preview of a purchase order's invoice. It shows the very PDF the vendor receives (the server-built tax invoice with the Renew Plus logo),
 * so the preview, the e-mailed attachment and the download are always identical.
 */
@Component({
  selector: 'app-purchase-invoice',
  standalone: true,
  imports: [CanActionDirective, CommonModule, MatDialogModule],
  templateUrl: './purchase-invoice.html',
  styleUrls: ['../../../../../shared/styles/erp-dialog.scss', './purchase-invoice.scss'],
})
export class PurchaseInvoice implements OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<PurchaseInvoice>);
  private readonly data = inject<{ orderId: string }>(MAT_DIALOG_DATA);
  private readonly purchase = inject(PurchaseService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly order = computed(() => this.purchase.orders().find(o => o.id === this.data.orderId)!);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly pdfUrl = signal<SafeResourceUrl | null>(null);
  private blob: Blob | null = null;
  private objectUrl: string | null = null;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    const blob = await this.purchase.pdfBlob('purchase-order', this.data.orderId);
    if (!blob) {
      this.failed.set(true);
      this.loading.set(false);
      return;
    }
    this.blob = blob;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(blob);
    // #toolbar=0 hides the viewer's own toolbar; the dialog has its own download button
    this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(`${this.objectUrl}#toolbar=0&navpanes=0&view=FitH`));
    this.loading.set(false);
  }

  /** Saves the PDF being previewed. */
  downloadPdf(): void {
    if (!this.blob || !this.objectUrl) return;
    const link = document.createElement('a');
    link.href = this.objectUrl;
    link.download = `Purchase_Invoice_${this.order().invoiceNo}.pdf`;
    link.click();
  }

  ngOnDestroy(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }

  close(): void {
    this.dialogRef.close();
  }
}
