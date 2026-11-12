import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { RazorpayCheckoutService, RazorpayResult } from '../../../shared/common-services/razorpay-checkout.service';
import { PAYMENT_MODES, PaymentMode, RazorpayOrder } from '../../../shared/models/appointment-flow.model';

export interface CustomerPaymentsData {
  id: number;
  name: string;
}

interface PaymentRow {
  id: number;
  payment_date: string | null;
  payment_mode: string;
  paid_amount: number;
  transaction_no: string | null;
  remarks: string | null;
  treatment: string | null;
}

interface SittingRow {
  id: number;
  plan_id: number;
  treatment: string | null;
  sitting_no: number;
  date: string | null;
  status: string;
  amount_due: number;
  balance: number;
  can_pay: boolean;
  /** The last sitting: it cannot be completed until the balance is paid. */
  required?: boolean;
}

interface PlanRow {
  id: number;
  treatment: string | null;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  sittings_count: number;
  completed_count: number;
  start_date: string | null;
}

interface CustomerInfo {
  id: number;
  name: string;
  customer_code: string;
  mobile_no: string | null;
  email: string | null;
  gender: string | null;
  city: string | null;
  branch_name: string | null;
  is_active: boolean;
  visits: number;
  last_visit: string | null;
  photo_url: string | null;
}

interface PaymentsPayload {
  customer: CustomerInfo;
  plans: PlanRow[];
  payments: PaymentRow[];
  sittings: SittingRow[];
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
}

/** Customer Payments [customer-payments]: every payment collected from the customer (GET /customers/{id}/payments). */
@Component({
  selector: 'app-customer-payments-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, CanActionDirective],
  templateUrl: './customer-payments-dialog.html',
  styleUrl: './customer-payments-dialog.scss',
})
export class CustomerPaymentsDialog implements OnInit {
  readonly loading = signal(true);
  readonly result = signal<PaymentsPayload | null>(null);
  readonly paymentModes = PAYMENT_MODES;
  readonly saving = signal(false);
  /** 20 segments of the overall progress bar (5% each). */
  readonly segs = Array.from({ length: 20 }, (_, i) => i);
  /** The sitting being paid: its draft payment. */
  payingId: number | null = null;
  payMode: PaymentMode = 'Cash';
  payAmount: number | null = null;
  payTxn = '';
  /** True once a payment was recorded, so the customer list reloads when the dialog closes. */
  changed = false;
  /** Internet Banking runs through Razorpay Checkout once the server has the keys. */
  readonly razorpayOn = signal(false);

  constructor(
    private api: ApiDataService,
    private toast: ToastService,
    private razorpay: RazorpayCheckoutService,
    private dialogRef: MatDialogRef<CustomerPaymentsDialog>,
    @Inject(MAT_DIALOG_DATA) public data: CustomerPaymentsData,
  ) { }

  ngOnInit(): void {
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/payment-options`).subscribe({
      next: (res: any) => this.razorpayOn.set(!!res?.data?.razorpay?.enabled),
      error: () => { /* no Razorpay: Internet Banking takes a manual reference */ },
    });
    this.load();
  }

  private load(): void {
    this.api.GET(`${ApiRoutesConstants.CUSTOMERS}/${this.data.id}/payments`).subscribe({
      next: (res: any) => {
        this.result.set(res?.data ?? null);
        this.loading.set(false);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.toast.error(err?.error?.message || 'Could not load the payments.');
        this.dialogRef.close();
      },
    });
  }

  /** Each treatment plan with its own sittings and money, in plan order. */
  groups(r: PaymentsPayload): { plan: PlanRow; sittings: SittingRow[] }[] {
    return r.plans.map(plan => ({ plan, sittings: r.sittings.filter(s => s.plan_id === plan.id) }));
  }

  planPct(p: PlanRow): number {
    return p.total_amount > 0 ? Math.min(100, Math.round((p.paid_amount / p.total_amount) * 100)) : 0;
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  }

  /** Share of the total already paid, 0-100. */
  paidPct(r: PaymentsPayload): number {
    return r.total_amount > 0 ? Math.min(100, Math.round((r.paid_amount / r.total_amount) * 100)) : 0;
  }

  setMode(mode: PaymentMode): void {
    this.payMode = mode;
  }

  formatDate(value: string | null): string {
    if (!value) return '-';
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  startPay(s: SittingRow): void {
    this.payingId = s.id;
    this.payMode = 'Cash';
    this.payAmount = s.amount_due;
    this.payTxn = '';
  }

  /** True when the chosen mode is Internet Banking and Razorpay is set up (no manual reference needed). */
  get usesRazorpay(): boolean {
    return this.payMode === 'Online' && this.razorpayOn();
  }

  /** Records the payment for one sitting (POST sittings/{id}/payment), then reloads the list. Internet Banking opens Razorpay Checkout first. */
  pay(s: SittingRow): void {
    const amount = Number(this.payAmount);
    if (!amount || amount <= 0) return void this.toast.error('Enter the amount received.');
    if (amount > s.balance) return void this.toast.error(`Only ${this.inr(s.balance)} is left to pay on this treatment.`);
    if (this.payMode !== 'Cash' && !this.usesRazorpay && !this.payTxn.trim()) return void this.toast.error('Enter the transaction / reference number.');

    // The receipt tab is opened in the click so the popup blocker allows it (not for Razorpay: Checkout comes first).
    if (!this.usesRazorpay) return this.submit(s, amount, null, window.open('', '_blank'));

    // The API creates a Razorpay order for exactly this amount; Checkout collects it; the API verifies the signature before saving.
    this.saving.set(true);
    this.api.POST(`${ApiRoutesConstants.SITTINGS}/${s.id}/razorpay-order`, { amount }).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.razorpay.open(res.data as RazorpayOrder)
          .then(result => this.submit(s, amount, result))
          .catch((e: Error) => this.toast.error(e.message));
      },
      error: (err: any) => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'Could not start the Razorpay payment.');
      },
    });
  }

  private submit(s: SittingRow, amount: number, razorpay: RazorpayResult | null, receiptTab: Window | null = null): void {
    this.saving.set(true);
    this.api.POST(`${ApiRoutesConstants.SITTINGS}/${s.id}/payment`, {
      payment_mode: this.payMode,
      paid_amount: amount,
      transaction_no: this.payTxn.trim() || null,
      ...razorpay,
    }).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.changed = true;
        this.payingId = null;
        this.toast.success(res?.message || 'Payment recorded.');
        this.load();
        // Every payment gets a receipt: opened straight away (a blocked popup falls back to the receipt button in the history).
        if (res?.data?.payment_id) this.openReceipt(res.data.payment_id, receiptTab);
        else receiptTab?.close();
      },
      error: (err: any) => {
        receiptTab?.close();
        this.saving.set(false);
        this.toast.error(err?.error?.errors?.paid_amount?.[0] || err?.error?.message || 'Could not record the payment.');
      },
    });
  }

  /** Opens the payment receipt PDF in a new tab (`tab` = one opened by the click, if any). */
  openReceipt(paymentId: number, tab: Window | null = null): void {
    const target = tab ?? window.open('', '_blank');
    this.api.GET_BLOB(`${ApiRoutesConstants.APPOINTMENT_FLOW}/payments/${paymentId}/receipt`).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (target) target.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        target?.close();
        this.toast.error('Could not open the receipt.');
      },
    });
  }

  inr(value: number | null | undefined): string {
    return '₹' + Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  formatDateTime(value: string | null): string {
    if (!value) return '-';
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  close(): void {
    this.dialogRef.close(this.changed);
  }
}
