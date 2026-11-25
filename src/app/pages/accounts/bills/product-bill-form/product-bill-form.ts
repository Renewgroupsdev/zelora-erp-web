import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../../core/http/api.service';
import { AccountsService } from '../../../../shared/common-services/accounts.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { InventoryService, ProductRecord } from '../../../../shared/common-services/inventory.service';
import { CartCustomer, ProductCartService } from '../../../../shared/common-services/product-cart.service';
import { PurchaseService } from '../../../../shared/common-services/purchase.service';
import { ToastService } from '../../../../shared/common-services/toast.service';
import { RazorpayCheckoutService, RazorpayResult } from '../../../../shared/common-services/razorpay-checkout.service';
import { PAYMENT_MODES as FLOW_PAYMENT_MODES, PaymentMode as FlowPaymentMode, PaymentOptions } from '../../../../shared/models/appointment-flow.model';
import { Bill, BillItem, PaymentMode, billTotals, lineAmount } from '../../../../shared/models/accounts.model';
import { isoDate } from '../../../../shared/utils/format.util';

export interface ProductBillData {
  /** Opened from Customer Management: starts the cart for this customer / branch. Omitted when opened from the navbar cart. */
  customer?: CartCustomer;
  /** Opened from the navbar cart list: the customer's cart to work on. */
  cartKey?: string;
  /** Paying several customers one after another from the navbar ("Pay all"): which one this is. */
  queue?: { index: number; total: number };
  step?: 'shop' | 'checkout';
}

/**
 * "Buy a Product". Step 1 lists the products stocked at the customer's branch / franchise and adds them to the shared cart
 * (the cart icon in the top navbar). Step 2 takes the payment with the consultation form's modes (UPI, Cash,
 * Internet Banking) and posts the tax invoice (Sales voucher + Receipt). Treatment / service billing stays in the Service Bill form.
 */
@Component({
  selector: 'app-product-bill-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './product-bill-form.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './product-bill-form.scss'],
})
export class ProductBillForm {
  private readonly dialogRef = inject(MatDialogRef<ProductBillForm, Bill>);
  private readonly data = inject<ProductBillData | null>(MAT_DIALOG_DATA);
  private readonly acc = inject(AccountsService);
  private readonly inventory = inject(InventoryService);
  private readonly purchase = inject(PurchaseService);
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  readonly cart = inject(ProductCartService);

  /** UPI, Cash and Internet Banking (Razorpay) - no EMI on a product purchase. */
  readonly modes = FLOW_PAYMENT_MODES.filter(m => m.value !== 'EMI');
  private readonly razorpay = inject(RazorpayCheckoutService);
  readonly today = isoDate();
  readonly step = signal<'shop' | 'checkout'>(this.data?.step ?? 'shop');
  readonly products = signal<ProductRecord[]>([]);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly payOptions = signal<PaymentOptions>({ razorpay: { enabled: false, key_id: null }, emi_partners: [], cash_min_amount: 1000 });

  readonly customer = this.cart.customer;
  readonly queue = this.data?.queue ?? null;

  /** Units in stock at the customer's branch / franchise, by product code. */
  readonly stockByCode = computed(() => {
    const c = this.customer();
    const map = new Map<string, number>();
    if (!c) return map;
    for (const b of this.purchase.stock()) {
      if ((b.storeKey === c.branchKey || (!c.branchKey && b.store === c.branch)) && b.qty > 0) map.set(b.productCode, (map.get(b.productCode) ?? 0) + b.qty);
    }
    return map;
  });
  /** Numeric Inventory product id by product code (from the branch's stock rows) - sent with each bill line so the stock can be reduced. */
  private readonly productIdByCode = computed(() => {
    const map = new Map<string, number>();
    for (const b of this.purchase.stock()) map.set(b.productCode, Number(b.productId));
    return map;
  });
  readonly shown = computed(() => {
    const q = this.search().trim().toLowerCase();
    const stock = this.stockByCode();
    return this.products().filter(p => stock.has(p.code) && (!q || p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)));
  });
  readonly items = computed<BillItem[]>(() => this.cart.lines().map(l => this.toItem(l.product, l.qty)));
  readonly totals = computed(() => billTotals(this.items()));

  // Payment (same fields as the consultation form's Payment step)
  mode: FlowPaymentMode = 'UPI';
  paidAmount: number | null = null;
  reference = '';
  notes = '';

  constructor() {
    if (this.data?.customer) this.cart.begin(this.data.customer);
    else if (this.data?.cartKey) this.cart.activate(this.data.cartKey);
    // A cart nothing was added to is dropped when the dialog closes.
    this.dialogRef.afterClosed().subscribe(() => this.cart.prune());
    void this.purchase.reload('stock').then(() => this.loading.set(false), () => this.loading.set(false));
    this.inventory.listProducts({ page: 1, perPage: 500, status: 'Active' }).subscribe({
      next: (res: any) => this.products.set(res?.data ?? []),
      error: () => this.products.set([]),
    });
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/payment-options`).subscribe({
      next: (res: any) => res?.data && this.payOptions.set(res.data),
      error: () => { /* defaults: no Razorpay - Internet Banking takes a typed bank reference */ },
    });
    this.acc.loadBranches().subscribe();
  }

  /** Product images that did not load (bad / unreachable URL): the pill icon is shown instead of a broken image. */
  readonly imgFailed = signal<Set<string>>(new Set());

  imgBroken(code: string): void {
    this.imgFailed.update(s => new Set(s).add(code));
  }

  /** Placeholder for a product with no photo: its initials on a tile whose colour is taken from the product code. */
  initials(p: ProductRecord): string {
    const words = p.name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  }

  hue(p: ProductRecord): number {
    let h = 0;
    for (const ch of p.code || p.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  private toItem(p: ProductRecord, qty: number): BillItem {
    return { productId: this.productIdByCode().get(p.code), description: p.name, sac: p.hsn_code ?? '', qty, rate: Number(p.selling_price) || 0, discountPercent: Number(p.discount_percent) || 0, gstPercent: Number(p.gst_percent) || 0 };
  }

  price(p: ProductRecord): number {
    return Number(p.selling_price) || 0;
  }

  stock(p: ProductRecord): number {
    return this.stockByCode().get(p.code) ?? 0;
  }

  add(p: ProductRecord): void {
    const max = this.stock(p);
    if (this.cart.qtyOf(p.code) >= max) {
      this.toast.warning(`Only ${max} of ${p.name} in stock at ${this.customer()?.branch}.`);
      return;
    }
    this.cart.add(p, max);
  }

  line(l: { product: ProductRecord; qty: number }) {
    return lineAmount(this.toItem(l.product, l.qty));
  }

  goCheckout(): void {
    if (!this.cart.lines().length) return;
    this.step.set('checkout');
    if (this.paidAmount === null) this.paidAmount = this.totals().grandTotal;
  }

  // ---- Payment ----------------------------------------------------------------------------------

  setMode(m: FlowPaymentMode): void {
    this.mode = m;
    this.reference = '';
  }

  /** Internet Banking goes through Razorpay Checkout once the keys are set on the server. */
  get usesRazorpay(): boolean {
    return this.mode === 'Online' && this.payOptions().razorpay.enabled;
  }

  /** UPI transaction ID, or a typed bank reference while Razorpay is not set up. */
  get needsReference(): boolean {
    return this.mode === 'UPI' || (this.mode === 'Online' && !this.usesRazorpay);
  }

  get referenceLabel(): string {
    return this.mode === 'UPI' ? 'UPI transaction ID' : 'Bank reference no';
  }

  get paying(): number {
    return this.paidAmount === null || this.paidAmount === undefined ? this.totals().grandTotal : Number(this.paidAmount) || 0;
  }

  get balance(): number {
    return Math.max(0, this.totals().grandTotal - this.paying);
  }

  error(): string | null {
    const c = this.customer();
    if (!c?.name) return 'The cart has no customer. Start from Customer Management.';
    if (!c.branch) return 'The customer has no branch / franchise to buy the products at.';
    if (!this.cart.lines().length) return 'Add at least one product to the cart.';
    const over = this.cart.lines().find(l => l.qty > (this.stockByCode().get(l.product.code) ?? 0));
    if (!this.loading() && over) return `${over.product.name}: only ${this.stockByCode().get(over.product.code) ?? 0} in stock at ${c.branch}.`;
    if (!this.totals().grandTotal) return 'Bill total is zero.';
    if (this.paying < 0 || this.paying > this.totals().grandTotal) return 'Amount paid must be between ₹0 and the bill total.';
    if (this.paying < 1) return 'Enter the amount being paid.';
    if (this.needsReference && !this.reference.trim()) return 'Enter the UPI / bank transaction reference.';
    return null;
  }

  /** The accounts ledgers know Cash / UPI / Card / Bank Transfer / Cheque: Internet Banking posts as Bank Transfer. */
  private accountsMode(): PaymentMode {
    return this.mode === 'Cash' ? 'Cash' : this.mode === 'UPI' ? 'UPI' : 'Bank Transfer';
  }

  private paymentNote(): string {
    const label = this.modes.find(m => m.value === this.mode)?.label ?? this.mode;
    const parts = [`Paid by ${label}`];
    if (this.reference.trim()) parts.push(`${this.referenceLabel}: ${this.reference.trim()}`);
    return parts.join(' · ');
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.submitted.set(true);
    this.serverError.set(null);
    if (this.error()) return;
    const c = this.customer()!;
    this.saving.set(true);

    // Internet Banking: the server creates a Razorpay order for exactly this amount, Checkout collects it, and the server
    // verifies the signature with Razorpay before the bill and its receipt are saved.
    let paid: RazorpayResult | undefined;
    if (this.usesRazorpay) {
      const order = await this.acc.razorpayOrder(this.paying, c.name, c.phone);
      if (typeof order === 'string') return this.fail(order);
      try {
        paid = await this.razorpay.open(order);
      } catch (e) {
        return this.fail(e instanceof Error ? e.message : 'The payment was not completed.');
      }
    }

    const note = [this.notes.trim(), this.paymentNote()].filter(Boolean).join(' | ').slice(0, 255);
    const result = await this.acc.createBill(
      {
        kind: 'Service', date: this.today, dueDate: this.today, branch: c.branch, notes: note,
        customerName: c.name, customerPhone: c.phone, customerAddress: '', customerGstin: '',
        items: this.items(),
      },
      this.paying > 0 ? { amount: this.paying, mode: this.accountsMode(), razorpay: paid } : null,
    );
    this.saving.set(false);
    if (typeof result === 'string') {
      this.serverError.set(result);
      return;
    }
    this.cart.clear();
    // A fully paid bill has taken its units out of the branch store: re-read the stock.
    void this.purchase.reload('stock');
    this.dialogRef.close(result);
  }

  private fail(message: string): void {
    this.saving.set(false);
    this.serverError.set(message);
  }

  close(): void {
    this.dialogRef.close();
  }
}
