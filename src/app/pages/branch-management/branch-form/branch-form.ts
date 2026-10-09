import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BranchService } from '../../../shared/common-services/branch.service';
import { FileUploadService, uploadError } from '../../../shared/common-services/file-upload.service';
import { BranchRecord, shrinkPhoto } from '../../../shared/models/branch-franchise.model';
import { isoDate } from '../../../shared/utils/format.util';

type BranchInput = Omit<BranchRecord, 'id' | 'code'>;

/** Add / edit a company-owned branch. */
@Component({
  selector: 'app-branch-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './branch-form.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', '../../../shared/styles/branch-franchise-dialog.scss'],
})
export class BranchForm {
  private readonly dialogRef = inject(MatDialogRef<BranchForm, BranchRecord>);
  private readonly data = inject<{ branchId?: string }>(MAT_DIALOG_DATA);
  private readonly store = inject(BranchService);
  private readonly uploads = inject(FileUploadService);

  readonly existing = this.data.branchId ? this.store.branch(this.data.branchId) ?? null : null;
  readonly isEdit = !!this.existing;
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly uploading = signal(false);

  model: BranchInput = this.existing
    ? structuredClone((({ id, code, ...rest }) => rest)(this.existing))
    : { name: '', city: '', state: 'Tamil Nadu', phone: '', email: '', address: '', headName: '', headPhone: '', headEmail: '', status: 'Active', openedOn: isoDate() };

  /** The photo is uploaded to the server (uploads/branch_photo); replaced / unused files are cleaned up on save or close. */
  private readonly photoDraft = this.uploads.draft('branch_photo', [this.existing?.photo]);
  private saved = false;

  constructor() {
    this.dialogRef.afterClosed().subscribe(() => {
      if (!this.saved) this.photoDraft.discard();
    });
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    this.serverError.set(null);
    if (form.invalid || this.uploading()) return;
    const result = this.existing ? this.store.update(this.existing.id, this.model) : this.store.add(this.model);
    if (typeof result === 'string') {
      this.serverError.set(result);
      return;
    }
    this.saved = true;
    this.photoDraft.commit([this.model.photo]);
    this.dialogRef.close(this.existing ? this.store.branch(this.existing.id) : (result as BranchRecord));
  }

  async onPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.serverError.set(null);
    this.uploading.set(true);
    try {
      const photo = await shrinkPhoto(file);
      this.uploads.upload('branch_photo', photo).subscribe({
        next: up => {
          this.photoDraft.track(up.url);
          this.model.photo = up.url;
          this.uploading.set(false);
        },
        error: err => {
          this.serverError.set(uploadError(err, 'Could not upload the photo. Please try again.'));
          this.uploading.set(false);
        },
      });
    } catch (e) {
      this.serverError.set((e as Error).message);
      this.uploading.set(false);
    }
  }

  removePhoto(): void {
    this.model.photo = undefined;
  }

  close(): void {
    this.dialogRef.close();
  }
}
