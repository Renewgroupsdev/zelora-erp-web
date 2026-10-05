import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { HrService } from '../../../../shared/common-services/hr.service';
import { printDocument } from '../../../../shared/utils/export.util';
import { amountInWords, displayDate, monthLabel } from '../../../../shared/utils/format.util';

@Component({
  selector: 'app-payslip-view',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './payslip-view.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', '../../../../shared/styles/erp-document.scss'],
})
export class PayslipView {
  private readonly dialogRef = inject(MatDialogRef<PayslipView>);
  private readonly data = inject<{ payslipId: string }>(MAT_DIALOG_DATA);
  private readonly hr = inject(HrService);
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  readonly slip = computed(() => this.hr.payslips().find(p => p.id === this.data.payslipId)!);
  readonly employee = computed(() => this.hr.employee(this.slip().empId)!);
  readonly monthLabel = monthLabel;
  readonly displayDate = displayDate;
  readonly amountInWords = amountInWords;

  downloadPdf(): void {
    printDocument(`Payslip ${this.employee().empCode} ${monthLabel(this.slip().month)}`, this.sheet().nativeElement.innerHTML);
  }

  close(): void {
    this.dialogRef.close();
  }
}
