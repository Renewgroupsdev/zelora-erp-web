import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AccountsService } from '../../../../shared/common-services/accounts.service';
import { LEDGER_GROUPS, Ledger, LedgerGroup } from '../../../../shared/models/accounts.model';

/** Create a ledger under an account group, with an optional opening balance. */
@Component({
  selector: 'app-create-ledger',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './create-ledger.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss'],
})
export class CreateLedger {
  private readonly dialogRef = inject(MatDialogRef<CreateLedger, Ledger>);
  private readonly acc = inject(AccountsService);
  readonly groups = LEDGER_GROUPS;
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);

  name = '';
  group: LedgerGroup = LEDGER_GROUPS[0];
  opening: number | null = null;
  side: 'Dr' | 'Cr' = 'Dr';
  phone = '';
  gstin = '';

  save(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (!this.name.trim() || this.phoneInvalid() || this.gstinInvalid()) return;

    const amount = Math.abs(Number(this.opening) || 0);
    const result = this.acc.addLedger({
      name: this.name,
      group: this.group,
      openingBalance: this.side === 'Cr' ? -amount : amount,
      phone: this.phone.trim(),
      gstin: this.gstin.trim().toUpperCase(),
    });
    if (typeof result === 'string') this.error.set(result);
    else this.dialogRef.close(result);
  }

  phoneInvalid(): boolean {
    return !!this.phone.trim() && !/^\d{10}$/.test(this.phone.trim());
  }

  gstinInvalid(): boolean {
    return !!this.gstin.trim() && !/^[0-9A-Za-z]{15}$/.test(this.gstin.trim());
  }

  close(): void {
    this.dialogRef.close();
  }
}
