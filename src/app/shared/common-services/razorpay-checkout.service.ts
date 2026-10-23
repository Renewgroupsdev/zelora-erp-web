import { Injectable } from '@angular/core';
import { RazorpayOrder } from '../models/appointment-flow.model';

/** What Razorpay Checkout hands back on success; the API verifies it before the payment counts. */
export interface RazorpayResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

const CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/**
 * Opens Razorpay Checkout (loaded on first use) for an order created by the API. Resolves with the payment ids +
 * signature, rejects with a readable message when the payment fails or the window is closed.
 */
@Injectable({ providedIn: 'root' })
export class RazorpayCheckoutService {
  private loader?: Promise<void>;

  open(order: RazorpayOrder, themeColor = '#0F5245'): Promise<RazorpayResult> {
    return this.load().then(() => new Promise<RazorpayResult>((resolve, reject) => {
      const Razorpay = (window as any).Razorpay;
      const checkout = new Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        theme: { color: themeColor },
        handler: (response: RazorpayResult) => resolve(response),
        modal: { ondismiss: () => reject(new Error('The payment window was closed before paying.')) },
      });
      checkout.on('payment.failed', (event: any) => reject(new Error(event?.error?.description || 'The payment failed. Please try again.')));
      checkout.open();
    }));
  }

  private load(): Promise<void> {
    if ((window as any).Razorpay) return Promise.resolve();
    this.loader ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHECKOUT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.loader = undefined; // allow another try (e.g. after the network comes back)
        script.remove();
        reject(new Error('Could not load Razorpay. Check the internet connection.'));
      };
      document.body.appendChild(script);
    });
    return this.loader;
  }
}
