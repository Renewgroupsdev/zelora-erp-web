import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BranchService } from '../../../shared/common-services/branch.service';
import { BranchRecord, readPhoto } from '../../../shared/models/branch-franchise.model';
import { isoDate } from '../../../shared/utils/format.util';

type BranchInput = Omit<BranchRecord, 'id' | 'code'>;

/** Add / edit a company-owned branch. */
@Component({
  selector: 'app-branch-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './branch-form.html',
  styleUrl: '../../../shared/styles/erp-dialog.scss',
})
export class BranchForm {
  private readonly dialogRef = inject(MatDialogRef<BranchForm, BranchRecord>);
  private readonly data = inject<{ branchId?: string }>(MAT_DIALOG_DATA);
  private readonly store = inject(BranchService);

  readonly existing = this.data.branchId ? this.store.branch(this.data.branchId) ?? null : null;
  readonly isEdit = !!this.existing;
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);

  model: BranchInput = this.existing
    ? structuredClone((({ id, code, ...rest }) => rest)(this.existing))
    : { name: '', city: '', state: 'Tamil Nadu', phone: '', email: '', address: '', headName: '', headPhone: '', headEmail: '', status: 'Active', openedOn: isoDate() };

  save(form: NgForm): void {
    this.submitted.set(true);
    this.serverError.set(null);
    if (form.invalid) return;
    const result = this.existing ? this.store.update(this.existing.id, this.model) : this.store.add(this.model);
    if (typeof result === 'string') {
      this.serverError.set(result);
      return;
    }
    this.dialogRef.close(this.existing ? this.store.branch(this.existing.id) : (result as BranchRecord));
  }

  async onPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.model.photo = await readPhoto(file);
      this.serverError.set(null);
    } catch (e) {
      this.serverError.set((e as Error).message);
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
