import { GeoLocationField } from '../../../shared/components/geo-location-field/geo-location-field';
import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FranchiseService, apiError } from '../../../shared/common-services/franchise.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { FileUploadService, uploadError } from '../../../shared/common-services/file-upload.service';
import { FranchiseRecord, shrinkPhoto } from '../../../shared/models/branch-franchise.model';
import { addDays, isoDate } from '../../../shared/utils/format.util';
import { PageLoader } from '../../../shared/components/page-loader/page-loader';
import { finalize } from 'rxjs';

type FranchiseInput = Omit<FranchiseRecord, 'id' | 'code'>;

/** Add / edit a franchise partner outlet and its revenue share. */
@Component({
  selector: 'app-franchise-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, GeoLocationField, PageLoader],
  templateUrl: './franchise-form.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', '../../../shared/styles/branch-franchise-dialog.scss'],
  styles: [':host .modal-body-custom { position: relative; }'],
})
export class FranchiseForm {
  private readonly dialogRef = inject(MatDialogRef<FranchiseForm, FranchiseRecord>);
  private readonly data = inject<{ franchiseId?: string }>(MAT_DIALOG_DATA);
  private readonly store = inject(FranchiseService);
  private readonly uploads = inject(FileUploadService);
  private readonly toast = inject(ToastService);

  /** Cached row first (instant header), replaced by the record fetched from the API. */
  existing: FranchiseRecord | null = this.data.franchiseId ? this.store.franchise(this.data.franchiseId) ?? null : null;
  readonly isEdit = !!this.data.franchiseId;
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly saving = signal(false);
  /** Edit: the heartbeat loader covers the form until the franchise is read from the API. */
  readonly loading = signal(this.isEdit);

  model: FranchiseInput = this.existing
    ? toInput(this.existing)
    : {
      name: '', ownerCompany: '', ownerName: '', ownerPhone: '', ownerEmail: '', city: '', state: 'Tamil Nadu', gstin: '', status: 'Pending',
      agreementFrom: isoDate(), agreementTo: addDays(isoDate(), 365 * 3), sharePercent: 70, shareEffectiveFrom: isoDate(), employees: 0, inventoryValue: 0,
      latitude: null, longitude: null,
    };

  /** The photo is uploaded to the server (uploads/franchise_photo); replaced / unused files are cleaned up on save or close. */
  private photoDraft = this.uploads.draft('franchise_photo', [this.existing?.photo]);
  private saved = false;

  constructor() {
    this.dialogRef.afterClosed().subscribe(() => {
      if (!this.saved) this.photoDraft.discard();
    });
    if (this.data.franchiseId) this.loadFranchise(this.data.franchiseId);
  }

  private loadFranchise(id: string): void {
    this.store.fetch(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ franchise }) => {
        this.existing = franchise;
        this.model = toInput(franchise);
        this.photoDraft = this.uploads.draft('franchise_photo', [franchise.photo]);
      },
      error: err => {
        this.toast.error(apiError(err, 'Failed to load the franchise. Please try again.'));
        if (!this.existing) this.dialogRef.close();
      },
    });
  }

  addOwner(): void {
    (this.model.additionalOwners ??= []).push({ company: '', name: '', phone: '', email: '' });
  }

  removeOwner(index: number): void {
    this.model.additionalOwners?.splice(index, 1);
  }

  get renewPercent(): number {
    return Math.round((100 - (Number(this.model.sharePercent) || 0)) * 100) / 100;
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    this.serverError.set(null);
    const share = Number(this.model.sharePercent);
    if (form.invalid || this.loading() || this.uploading() || this.saving() || !(share >= 0 && share <= 100)) return;
    const additionalOwners = (this.model.additionalOwners ?? [])
      .map(o => ({ company: o.company.trim(), name: o.name.trim(), phone: o.phone.trim(), email: o.email.trim() }))
      .filter(o => o.name);
    const payload = { ...this.model, additionalOwners, sharePercent: share, employees: Number(this.model.employees) || 0, inventoryValue: Math.max(0, Number(this.model.inventoryValue) || 0), gstin: (this.model.gstin ?? '').trim().toUpperCase() };

    this.saving.set(true);
    this.store.save(this.existing?.id ?? null, payload).subscribe({
      next: franchise => {
        this.saved = true;
        this.saving.set(false);
        this.photoDraft.commit([this.model.photo]);
        this.toast.success(this.isEdit ? 'Franchise updated successfully' : 'Franchise saved successfully');
        this.dialogRef.close(franchise);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(apiError(err, 'Failed to save franchise. Please try again.'));
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
      this.uploads.upload('franchise_photo', photo).subscribe({
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

  close(): void {
    this.dialogRef.close();
  }
}

function toInput(franchise: FranchiseRecord): FranchiseInput {
  return structuredClone((({ id, code, ...rest }) => rest)(franchise));
}
