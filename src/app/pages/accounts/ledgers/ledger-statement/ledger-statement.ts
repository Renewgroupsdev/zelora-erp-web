import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AccountsService } from '../../../../shared/common-services/accounts.service';
import { drCr } from '../../../../shared/models/accounts.model';
import { downloadExcel, printDocument } from '../../../../shared/utils/export.util';
import { addDays, displayDate, isoDate } from '../../../../shared/utils/format.util';

/** Tally "Ledger Vouchers" view: opening, every voucher with running balance, closing. */
@Component({
  selector: 'app-ledger-statement',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './ledger-statement.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', '../../../../shared/styles/erp-document.scss'],
})
export class LedgerStatement {
  private readonly dialogRef = inject(MatDialogRef<LedgerStatement>);
  private readonly data = inject<{ ledgerId: string }>(MAT_DIALOG_DATA);
  readonly acc = inject(AccountsService);
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  readonly from = signal(addDays(isoDate(), -30));
  readonly to = signal(isoDate());
  readonly ledger = computed(() => this.acc.ledger(this.data.ledgerId)!);
  readonly statement = computed(() => this.acc.ledgerStatement(this.data.ledgerId, this.from(), this.to()));
  readonly totals = computed(() => this.statement().lines.reduce((t, l) => ({ debit: t.debit + l.debit, credit: t.credit + l.credit }), { debit: 0, credit: 0 }));
  readonly drCr = drCr;
  readonly displayDate = displayDate;

  downloadPdf(): void {
    printDocument(`Ledger ${this.ledger().name}`, this.sheet().nativeElement.innerHTML);
  }

  exportExcel(): void {
    const s = this.statement();
    downloadExcel(`ledger-${this.ledger().name.replace(/\W+/g, '-').toLowerCase()}-${this.from()}-to-${this.to()}`, [{
      name: this.ledger().name,
      columns: [{ header: 'Date', key: 'date' }, { header: 'Particulars', key: 'particulars' }, { header: 'Vch Type', key: 'type' }, { header: 'Vch No', key: 'no' }, { header: 'Debit', key: 'debit' }, { header: 'Credit', key: 'credit' }, { header: 'Balance', key: 'balance' }],
      rows: [
        { date: this.from(), particulars: 'Opening Balance', balance: drCr(s.opening) },
        ...s.lines.map(l => ({ date: l.voucher.date, particulars: l.particulars, type: l.voucher.type, no: l.voucher.voucherNo, debit: l.debit || '', credit: l.credit || '', balance: drCr(l.balance) })),
      ],
      totals: { date: 'Closing Balance', debit: this.totals().debit, credit: this.totals().credit, balance: drCr(s.closing) },
    }]);
  }

  close(): void {
    this.dialogRef.close();
  }
}
