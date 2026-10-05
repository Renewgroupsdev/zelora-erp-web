import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AccountsService } from '../../../../shared/common-services/accounts.service';
import { CASH_GROUPS, voucherAmount } from '../../../../shared/models/accounts.model';
import { printDocument } from '../../../../shared/utils/export.util';
import { amountInWords, displayDate } from '../../../../shared/utils/format.util';

/** Printable voucher - Credit / Debit notes print as notes addressed to the party. */
@Component({
  selector: 'app-voucher-view',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './voucher-view.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', '../../../../shared/styles/erp-document.scss'],
})
export class VoucherView {
  private readonly dialogRef = inject(MatDialogRef<VoucherView>);
  private readonly data = inject<{ voucherId: string }>(MAT_DIALOG_DATA);
  readonly acc = inject(AccountsService);
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  readonly voucher = computed(() => this.acc.vouchers().find(v => v.id === this.data.voucherId)!);
  readonly amount = computed(() => voucherAmount(this.voucher()));
  readonly isNote = computed(() => this.voucher().type === 'Credit Note' || this.voucher().type === 'Debit Note');
  /** The party a note is addressed to: the debtor / creditor line, else the first non-cash ledger. */
  readonly party = computed(() => {
    const ledgers = this.voucher().entries.map(e => this.acc.ledger(e.ledgerId)).filter(l => !!l);
    return ledgers.find(l => l!.group === 'Sundry Debtors' || l!.group === 'Sundry Creditors') ?? ledgers.find(l => !CASH_GROUPS.includes(l!.group));
  });
  readonly title = computed(() => (this.isNote() ? this.voucher().type.toUpperCase() : `${this.voucher().type.toUpperCase()} VOUCHER`));

  readonly displayDate = displayDate;
  readonly amountInWords = amountInWords;

  downloadPdf(): void {
    printDocument(`${this.voucher().type} ${this.voucher().voucherNo}`, this.sheet().nativeElement.innerHTML);
  }

  close(): void {
    this.dialogRef.close();
  }
}
