import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PurchaseService } from '../../../../shared/common-services/purchase.service';
import { LowStockRow, inr } from '../../../../shared/models/purchase.model';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';

/**
 * Low Stock Replenishment (Super Admin / Admin): Central Store products under the low-stock level. The head office picks the
 * products and quantities, the vendor and the expected date; one purchase order is raised to that vendor and the goods are
 * received into the Central Store through Purchase Inward.
 */
@Component({
  selector: 'app-low-stock-replenishment',
  standalone: true,
  imports: [CommonModule, FormsModule, PurchaseTabs],
  templateUrl: './low-stock-replenishment.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class LowStockReplenishment implements OnInit {
  private readonly purchase = inject(PurchaseService);
  readonly inr = inr;

  readonly rows = signal<LowStockRow[]>([]);
  readonly vendors = signal<{ id: number; name: string }[]>([]);
  readonly threshold = signal(10);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly today = new Date().toISOString().slice(0, 10);

  /** Selected products -> quantity to order. */
  readonly picked = signal<Record<string, number>>({});
  vendorId: number | null = null;
  expectedAt = '';
  notes = '';

  readonly outCount = computed(() => this.rows().filter(r => r.out).length);
  readonly pickedRows = computed(() => this.rows().filter(r => this.picked()[r.productId] !== undefined));
  readonly total = computed(() => this.pickedRows().reduce((s, r) => s + this.picked()[r.productId] * r.unitPrice * (1 + r.gstPercent / 100), 0));

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const res = await this.purchase.lowStockOrders();
    this.rows.set(res.rows);
    this.vendors.set(res.vendors);
    this.threshold.set(res.threshold);
    this.picked.set({});
    this.loading.set(false);
  }

  isPicked(r: LowStockRow): boolean {
    return this.picked()[r.productId] !== undefined;
  }

  toggle(r: LowStockRow): void {
    const next = { ...this.picked() };
    if (this.isPicked(r)) delete next[r.productId]; else next[r.productId] = r.suggestedQty;
    this.picked.set(next);
    // default the vendor to the first picked product's own vendor
    if (!this.vendorId) this.vendorId = this.pickedRows()[0]?.vendorId ?? null;
  }

  toggleAll(on: boolean): void {
    this.picked.set(on ? Object.fromEntries(this.rows().map(r => [r.productId, r.suggestedQty])) : {});
    if (on && !this.vendorId) this.vendorId = this.rows().find(r => r.vendorId)?.vendorId ?? null;
  }

  setQty(r: LowStockRow, value: string | number): void {
    this.picked.set({ ...this.picked(), [r.productId]: Math.floor(Number(value)) || 0 });
  }

  amount(r: LowStockRow): number {
    return (this.picked()[r.productId] ?? 0) * r.unitPrice * (1 + r.gstPercent / 100);
  }

  async order(): Promise<void> {
    this.error.set('');
    const items = this.pickedRows().map(r => ({ productId: r.productId, qty: this.picked()[r.productId] }));
    if (!items.length) return void this.error.set('Select at least one product.');
    if (items.some(i => !Number.isInteger(i.qty) || i.qty < 1)) return void this.error.set('Every selected product needs a quantity of at least 1.');
    if (!this.vendorId) return void this.error.set('Choose the vendor to order from.');
    if (this.expectedAt && this.expectedAt < this.today) return void this.error.set('Expected delivery cannot be in the past.');

    this.saving.set(true);
    const order = await this.purchase.createLowStockOrder(this.vendorId, items, this.expectedAt || null, this.notes.trim());
    this.saving.set(false);
    if (!order) return;
    this.vendorId = null;
    this.expectedAt = '';
    this.notes = '';
    await this.load();
  }
}
