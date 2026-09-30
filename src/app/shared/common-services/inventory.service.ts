import { Injectable, signal } from '@angular/core';

export interface Vendor {
  id: string;
  code: string;
  name: string;
  address: string;
  gstNo: string;
  phone: string;
  email: string;
  /** Ids of the products this vendor supplies (mirrors Product.vendorId). */
  productIds: string[];
  status: 'Active' | 'Inactive';
}

export interface Product {
  id: string;
  /** Auto-generated, e.g. PRD-0001. */
  code: string;
  name: string;
  description?: string;
  vendorId: string | null;
  purchasePrice: number;
  marginPercent: number;
  sellingPrice: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  status: 'Active' | 'Inactive';
}

/** selling = purchase + margin%, then GST on top of the selling price. */
export function calculatePricing(purchasePrice: number, marginPercent: number, gstPercent: number) {
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const purchase = Number(purchasePrice) || 0;
  const sellingPrice = round2(purchase + purchase * (Number(marginPercent) || 0) / 100);
  const gstAmount = round2(sellingPrice * (Number(gstPercent) || 0) / 100);
  return { sellingPrice, gstAmount, totalAmount: round2(sellingPrice + gstAmount) };
}

/**
 * Front-end only store for Inventory (products + vendors), persisted in localStorage
 * until the inventory API exists.
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly productKey = 'renew-plus-inventory-products';
  private readonly vendorKey = 'renew-plus-inventory-vendors';

  readonly products = signal<Product[]>(this.load<Product>(this.productKey, () => this.seedProducts()));
  readonly vendors = signal<Vendor[]>(this.load<Vendor>(this.vendorKey, () => this.seedVendors()));

  /** Next product code, e.g. PRD-0004 (max existing number + 1). */
  nextProductCode(): string {
    const max = this.products().reduce((m, p) => Math.max(m, Number(p.code.replace(/\D/g, '')) || 0), 0);
    return `PRD-${String(max + 1).padStart(4, '0')}`;
  }

  nextVendorCode(): string {
    const max = this.vendors().reduce((m, v) => Math.max(m, Number(v.code.replace(/\D/g, '')) || 0), 0);
    return `VEN-${String(max + 1).padStart(4, '0')}`;
  }

  vendorName(id: string | null): string {
    return this.vendors().find(v => v.id === id)?.name ?? '-';
  }

  saveProduct(product: Product): void {
    const exists = this.products().some(p => p.id === product.id);
    this.products.set(exists ? this.products().map(p => p.id === product.id ? product : p) : [...this.products(), product]);
    this.persist(this.productKey, this.products());
    this.syncVendorMapping(product);
  }

  deleteProduct(id: string): void {
    this.products.set(this.products().filter(p => p.id !== id));
    this.persist(this.productKey, this.products());
    this.vendors.set(this.vendors().map(v => ({ ...v, productIds: v.productIds.filter(pid => pid !== id) })));
    this.persist(this.vendorKey, this.vendors());
  }

  saveVendor(vendor: Vendor): void {
    const exists = this.vendors().some(v => v.id === vendor.id);
    this.vendors.set(exists ? this.vendors().map(v => v.id === vendor.id ? vendor : v) : [...this.vendors(), vendor]);
    this.persist(this.vendorKey, this.vendors());

    // A product maps to one vendor: mapped products point here, un-mapped ones that pointed here are released.
    this.products.set(this.products().map(p => {
      if (vendor.productIds.includes(p.id)) return { ...p, vendorId: vendor.id };
      return p.vendorId === vendor.id ? { ...p, vendorId: null } : p;
    }));
    this.persist(this.productKey, this.products());
    // Products that moved to this vendor must leave their previous vendor's list.
    this.vendors.set(this.vendors().map(v => v.id === vendor.id
      ? v
      : { ...v, productIds: v.productIds.filter(pid => !vendor.productIds.includes(pid)) }));
    this.persist(this.vendorKey, this.vendors());
  }

  deleteVendor(id: string): void {
    this.vendors.set(this.vendors().filter(v => v.id !== id));
    this.persist(this.vendorKey, this.vendors());
    this.products.set(this.products().map(p => p.vendorId === id ? { ...p, vendorId: null } : p));
    this.persist(this.productKey, this.products());
  }

  newId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Keep vendor.productIds in step when a product's supplier changes. */
  private syncVendorMapping(product: Product): void {
    this.vendors.set(this.vendors().map(v => {
      const without = v.productIds.filter(pid => pid !== product.id);
      return v.id === product.vendorId ? { ...v, productIds: [...without, product.id] } : { ...v, productIds: without };
    }));
    this.persist(this.vendorKey, this.vendors());
  }

  private load<T>(key: string, seed: () => T[]): T[] {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch { /* fall through to seed data */ }
    return seed();
  }

  private persist(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  private seedVendors(): Vendor[] {
    return [
      { id: 'v1', code: 'VEN-0001', name: 'Medico Supplies Pvt Ltd', address: '12, Anna Salai, Chennai - 600002', gstNo: '33AABCM1234F1Z5', phone: '9840012345', email: 'sales@medicosupplies.in', productIds: ['p1', 'p2'], status: 'Active' },
      { id: 'v2', code: 'VEN-0002', name: 'DermaCare Distributors', address: '45, MG Road, Bengaluru - 560001', gstNo: '29AAECD5678K1Z2', phone: '9880054321', email: 'orders@dermacare.in', productIds: ['p3'], status: 'Active' },
    ];
  }

  private seedProducts(): Product[] {
    const make = (id: string, code: string, name: string, vendorId: string, purchase: number, margin: number, gst: number): Product =>
      ({ id, code, name, vendorId, purchasePrice: purchase, marginPercent: margin, gstPercent: gst, ...calculatePricing(purchase, margin, gst), status: 'Active' });
    return [
      make('p1', 'PRD-0001', 'PRP Kit', 'v1', 1200, 25, 18),
      make('p2', 'PRD-0002', 'Disposable Syringe (100 pcs)', 'v1', 350, 20, 12),
      make('p3', 'PRD-0003', 'Vitamin C Serum', 'v2', 800, 30, 18),
    ];
  }
}
