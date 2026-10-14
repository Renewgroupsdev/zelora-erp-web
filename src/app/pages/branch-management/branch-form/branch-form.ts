import { GeoLocationField } from '../../../shared/components/geo-location-field/geo-location-field';
import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BranchService, apiError } from '../../../shared/common-services/branch.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { FileUploadService, uploadError } from '../../../shared/common-services/file-upload.service';
import { BranchRecord, shrinkPhoto } from '../../../shared/models/branch-franchise.model';
import { isoDate } from '../../../shared/utils/format.util';

type BranchInput = Omit<BranchRecord, 'id' | 'code'>;

/** Add / edit a company-owned branch. */
@Component({
  selector: 'app-branch-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, GeoLocationField],
  templateUrl: './branch-form.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', '../../../shared/styles/branch-franchise-dialog.scss'],
})
export class BranchForm {
  private readonly dialogRef = inject(MatDialogRef<BranchForm, BranchRecord>);
  private readonly data = inject<{ branchId?: string }>(MAT_DIALOG_DATA);
  private readonly store = inject(BranchService);
  private readonly uploads = inject(FileUploadService);
  private readonly toast = inject(ToastService);

  readonly existing = this.data.branchId ? this.store.branch(this.data.branchId) ?? null : null;
  readonly isEdit = !!this.existing;
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly saving = signal(false);

  model: BranchInput = this.existing
    ? structuredClone((({ id, code, ...rest }) => rest)(this.existing))
    : { name: '', city: '', state: 'Tamil Nadu', phone: '', email: '', address: '', headName: '', headPhone: '', headEmail: '', status: 'Active', openedOn: isoDate(), latitude: null, longitude: null };

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
    if (form.invalid || this.uploading() || this.saving()) return;
    this.saving.set(true);
    this.store.save(this.existing?.id ?? null, this.model).subscribe({
      next: branch => {
        this.saved = true;
        this.saving.set(false);
        // The API already freed the replaced photo; this drops uploads that were picked and then discarded.
        this.photoDraft.commit([this.model.photo]);
        this.toast.success(this.existing ? 'Branch updated successfully' : 'Branch saved successfully');
        this.dialogRef.close(branch);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(apiError(err, 'Failed to save branch. Please try again.'));
      },
    });
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
          this.toast.error(uploadError(err, 'Could not upload the photo. Please try again.'));
          this.uploading.set(false);
        },
      });
    } catch (e) {
      this.toast.error((e as Error).message);
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
