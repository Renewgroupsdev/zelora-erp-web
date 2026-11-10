import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { VendorRecord } from '../../../../shared/common-services/inventory.service';
import { CanActionDirective } from '../../../../shared/directives/can-action.directive';

export interface VendorViewData {
  vendor: VendorRecord;
}

@Component({
  selector: 'app-vendor-view',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CanActionDirective],
  templateUrl: './vendor-view.html',
  styleUrl: './vendor-view.scss',
})
export class VendorView {
  readonly vendor: VendorRecord;

  constructor(
    private readonly ref: MatDialogRef<VendorView, 'edit' | undefined>,
    @Inject(MAT_DIALOG_DATA) data: VendorViewData,
  ) {
    this.vendor = data.vendor;
  }

  get isActive(): boolean {
    return this.vendor.status === 'Active';
  }

  /** GSTIN's first two digits are the state code. */
  get stateCode(): string {
    return /^\d{2}/.test(this.vendor.gst_no ?? '') ? this.vendor.gst_no.slice(0, 2) : '-';
  }

  edit(): void {
    this.ref.close('edit');
  }

  close(): void {
    this.ref.close();
  }
}
