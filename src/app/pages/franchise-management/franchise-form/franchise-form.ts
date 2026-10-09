import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FileUploadService, uploadError } from '../../../shared/common-services/file-upload.service';
import { FranchiseService } from '../../../shared/common-services/franchise.service';
import { FranchiseRecord, shrinkPhoto } from '../../../shared/models/branch-franchise.model';
import { addDays, isoDate } from '../../../shared/utils/format.util';

type FranchiseInput = Omit<FranchiseRecord, 'id' | 'code'>;

/** Add / edit a franchise partner outlet and its revenue share. */
@Component({
  selector: 'app-franchise-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './franchise-form.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', '../../../shared/styles/branch-franchise-dialog.scss'],
})
export class FranchiseForm {
  private readonly dialogRef = inject(MatDialogRef<FranchiseForm, FranchiseRecord>);
  private readonly data = inject<{ franchiseId?: string }>(MAT_DIALOG_DATA);
  private readonly store = inject(FranchiseService);
  private readonly uploads = inject(FileUploadService);

  readonly existing = this.data.franchiseId ? this.store.franchise(this.data.franchiseId) ?? null : null;
  readonly isEdit = !!this.existing;
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly uploading = signal(false);

  model: FranchiseInput = this.existing
    ? structuredClone((({ id, code, ...rest }) => rest)(this.existing))
    : {
      name: '', ownerCompany: '', ownerName: '', ownerPhone: '', ownerEmail: '', city: '', state: 'Tamil Nadu', gstin: '', status: 'Pending',
      agreementFrom: isoDate(), agreementTo: addDays(isoDate(), 365 * 3), sharePercent: 70, shareEffectiveFrom: isoDate(), employees: 0, inventoryValue: 0,
    };

  /** The photo is uploaded to the server (uploads/franchise_photo); replaced / unused files are cleaned up on save or close. */
  private readonly photoDraft = this.uploads.draft('franchise_photo', [this.existing?.photo]);
  private saved = false;

  constructor() {
    this.dialogRef.afterClosed().subscribe(() => {
      if (!this.saved) this.photoDraft.discard();
    });
  }

  get renewPercent(): number {
    return Math.round((100 - (Number(this.model.sharePercent) || 0)) * 100) / 100;
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    this.serverError.set(null);
    const share = Number(this.model.sharePercent);
    if (form.invalid || this.uploading() || !(share >= 0 && share <= 100)) return;
    const payload = { ...this.model, sharePercent: share, employees: Number(this.model.employees) || 0, inventoryValue: Math.max(0, Number(this.model.inventoryValue) || 0), gstin: this.model.gstin.trim().toUpperCase() };
    if (this.existing) {
      this.store.update(this.existing.id, payload);
      this.finish();
      this.dialogRef.close(this.store.franchise(this.existing.id));
      return;
    }
    const result = this.store.add(payload);
    if (typeof result === 'string') {
      this.serverError.set(result);
      return;
    }
    this.finish();
    this.dialogRef.close(result);
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
      this.uploads.upload('franchise_photo', photo).subscribe({
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

  private finish(): void {
    this.saved = true;
    this.photoDraft.commit([this.model.photo]);
  }
}
