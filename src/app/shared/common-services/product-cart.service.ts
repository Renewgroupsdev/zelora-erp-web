import { Injectable, computed, signal } from '@angular/core';
import { ProductRecord } from './inventory.service';

/** Who the cart is for and the branch / franchise the products are bought at (stock is read from that unit). */
export interface CartCustomer {
  name: string;
  phone: string;
  branch: string;
  /** "branch:9" / "franchise:7" - the stock store key. */
  branchKey: string;
  /** Shown in the cart's order summary and saved on the bill. */
  code?: string;
  email?: string;
  address?: string;
}

export interface CartLine {
  product: ProductRecord;
  qty: number;
  /** Units in stock at the branch when the product was added - the most that can be bought. */
  max: number;
}

/** One customer's cart. Several customers can have a cart open at the same time (each shows in the top navbar). */
export interface CustomerCart {
  key: string;
  customer: CartCustomer;
  lines: CartLine[];
}

const STORAGE_KEY = 'renew.product-carts.v2';

/** "Buy a Product" carts, one per customer + branch. The navbar cart icon lists them; kept across reloads. */
@Injectable({ providedIn: 'root' })
export class ProductCartService {
  readonly carts = signal<CustomerCart[]>([]);
  /** The cart the Buy a Product dialog is working on. */
  readonly activeKey = signal<string | null>(null);

  readonly active = computed(() => this.carts().find(c => c.key === this.activeKey()) ?? null);
  readonly customer = computed(() => this.active()?.customer ?? null);
  readonly lines = computed(() => this.active()?.lines ?? []);
  /** Units in the active cart. */
  readonly count = computed(() => this.lines().reduce((s, l) => s + l.qty, 0));
  /** Carts that hold something - what the navbar lists. */
  readonly filled = computed(() => this.carts().filter(c => c.lines.length > 0));
  /** Units across every customer's cart - the navbar badge. */
  readonly totalCount = computed(() => this.filled().reduce((s, c) => s + c.lines.reduce((n, l) => n + l.qty, 0), 0));

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (Array.isArray(saved?.carts)) this.carts.set(saved.carts);
    } catch { /* storage blocked or corrupt: start empty */ }
  }

  static keyOf(c: CartCustomer): string {
    return `${c.branchKey || c.branch}|${c.phone || c.name}`;
  }

  /** Makes this customer's cart the active one (created when new); other customers' carts stay as they are. */
  begin(customer: CartCustomer): void {
    const key = ProductCartService.keyOf(customer);
    if (!this.carts().some(c => c.key === key)) this.carts.update(cs => [...cs, { key, customer, lines: [] }]);
    this.activeKey.set(key);
    this.persist();
  }

  /** Opens an existing cart (from the navbar list). */
  activate(key: string): boolean {
    if (!this.carts().some(c => c.key === key)) return false;
    this.activeKey.set(key);
    return true;
  }

  qtyOf(productCode: string): number {
    return this.lines().find(l => l.product.code === productCode)?.qty ?? 0;
  }

  add(product: ProductRecord, max: number): void {
    const have = this.qtyOf(product.code);
    if (have >= max) return;
    this.edit(ls => have ? ls.map(l => l.product.code === product.code ? { ...l, qty: l.qty + 1, max } : l) : [...ls, { product, qty: 1, max }]);
  }

  setQty(productCode: string, qty: number): void {
    const q = Math.floor(Number(qty));
    if (!(q >= 1)) return this.remove(productCode);
    this.edit(ls => ls.map(l => l.product.code === productCode ? { ...l, qty: Math.min(q, l.max) } : l));
  }

  remove(productCode: string): void {
    this.edit(ls => ls.filter(l => l.product.code !== productCode));
  }

  /** Removes every product from the active cart (the cart itself stays for this customer). */
  clearLines(): void {
    this.edit(() => []);
  }

  /** Drops the active customer's cart (after the bill is saved). */
  clear(): void {
    const key = this.activeKey();
    this.carts.update(cs => cs.filter(c => c.key !== key));
    this.activeKey.set(null);
    this.persist();
  }

  /** Drops carts that ended up empty (dialog closed without buying). */
  prune(): void {
    this.carts.update(cs => cs.filter(c => c.lines.length > 0));
    this.persist();
  }

  private edit(change: (lines: CartLine[]) => CartLine[]): void {
    const key = this.activeKey();
    this.carts.update(cs => cs.map(c => c.key === key ? { ...c, lines: change(c.lines) } : c));
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ carts: this.carts() }));
    } catch { /* ignore */ }
  }
}
