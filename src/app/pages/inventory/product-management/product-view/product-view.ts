import { CommonModule } from '@angular/common';
import { Component, Inject, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { InventoryService, ProductRecord } from '../../../../shared/common-services/inventory.service';
import { CanActionDirective } from '../../../../shared/directives/can-action.directive';

export interface ProductViewData {
  product: ProductRecord;
}

@Component({
  selector: 'app-product-view',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CanActionDirective],
  templateUrl: './product-view.html',
  styleUrl: './product-view.scss',
})
export class ProductView {
  readonly product: ProductRecord;
  readonly zoom = signal(false);
  readonly imgFailed = signal(false);
  private readonly inventory = inject(InventoryService);
  /** Price history rows (null while loading). */
  readonly history = signal<any[] | null>(null);
  readonly sourceLabel = (s: string) => ({ created: 'Opening price', edited: 'Edited', vendor_revision: 'Vendor quote' } as Record<string, string>)[s] ?? s;

  constructor(
    private readonly ref: MatDialogRef<ProductView, 'edit' | undefined>,
    @Inject(MAT_DIALOG_DATA) data: ProductViewData,
  ) {
    this.product = data.product;
    this.inventory.productPriceHistory(data.product.id).subscribe({ next: (res: any) => this.history.set(res?.data ?? []), error: () => this.history.set([]) });
  }

  get initials(): string {
    const words = this.product.name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || 'P';
  }

  num(v: number | string | null | undefined): number {
    return Number(v ?? 0);
  }

  inr(v: number | string | null | undefined): string {
    return `₹${this.num(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /** Purchase price + margin, before discount and GST. */
  get marginAmount(): number {
    return this.num(this.product.purchase_price) * this.num(this.product.margin_percent) / 100;
  }

  get isActive(): boolean {
    return this.product.status === 'Active';
  }

  edit(): void {
    this.ref.close('edit');
  }

  close(): void {
    this.ref.close();
  }
}
