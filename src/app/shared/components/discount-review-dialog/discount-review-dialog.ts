import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../common-services/api-route-constants';
import { ToastService } from '../../common-services/toast.service';
import { DiscountType, FlowDiscountRequest, inr } from '../../models/appointment-flow.model';
import { PageLoader } from '../page-loader/page-loader';

/**
 * The branch manager's view of a discount request: which customer, the treatments and their total, what was asked
 * and why. They approve (keeping the requested value or setting another percentage / amount) or reject with a note;
 * the consultation's Payment step shows the decision straight away. Closes with `true` once a decision was saved.
 */
@Component({
  selector: 'app-discount-review-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, PageLoader],
  templateUrl: './discount-review-dialog.html',
  styleUrls: ['../../styles/erp-dialog.scss', './discount-review-dialog.scss'],
})
export class DiscountReviewDialog implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = inject(MatDialogRef<DiscountReviewDialog, boolean>);
  private readonly data = inject<{ id: number }>(MAT_DIALOG_DATA);

  readonly inr = inr;
  readonly req = signal<FlowDiscountRequest | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly busy = signal<'approve' | 'reject' | null>(null);
  readonly formError = signal('');

  /** What the manager approves: starts as the request, can be changed. */
  type: DiscountType = 'percent';
  value: number | null = null;
  note = '';

  readonly pending = computed(() => this.req()?.status === 'Pending');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/discount-requests/${this.data.id}`)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res: any) => {
          const r = res.data as FlowDiscountRequest;
          this.req.set(r);
          this.type = r.discount_type;
          this.value = r.requested_value;
        },
        error: (err: any) => this.loadError.set(err?.error?.message || 'Could not open this discount request.'),
      });
  }

  /** The most that can be approved, in rupees. */
  get cap(): number {
    const r = this.req();
    return r ? Math.round((r.subtotal_amount * r.max_discount_percent) / 100 * 100) / 100 : 0;
  }

  /** Rupee value of what is typed (percentage of the total, or the amount itself). */
  get approvedAmount(): number {
    const r = this.req();
    const v = Number(this.value) || 0;
    if (!r || v <= 0) return 0;
    return this.type === 'percent' ? Math.round(r.subtotal_amount * v / 100 * 100) / 100 : Math.round(v * 100) / 100;
  }

  get payable(): number {
    return Math.max(0, (this.req()?.subtotal_amount ?? 0) - this.approvedAmount);
  }

  get overCap(): boolean {
    return this.approvedAmount > this.cap + 0.001;
  }

  setType(type: DiscountType): void {
    if (this.type === type) return;
    // Keep the same rupee value when switching, so the manager only has to adjust it.
    const r = this.req();
    const amount = this.approvedAmount;
    this.type = type;
    this.value = type === 'amount' ? amount || null : r && r.subtotal_amount > 0 ? Math.round(amount / r.subtotal_amount * 10000) / 100 || null : null;
  }

  approve(): void {
    this.formError.set('');
    if (!(this.approvedAmount > 0)) return void this.formError.set('Enter the discount to approve.');
    if (this.overCap) return void this.formError.set(`The discount can be at most ${this.req()!.max_discount_percent}% of the total (${inr(this.cap)}).`);
    this.decide('approve');
  }

  reject(): void {
    this.formError.set('');
    if (!this.note.trim()) return void this.formError.set('Write why the discount is rejected.');
    this.decide('reject');
  }

  private decide(decision: 'approve' | 'reject'): void {
    this.busy.set(decision);
    this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/discount-requests/${this.data.id}/decision`, {
      decision,
      ...(decision === 'approve' ? { discount_type: this.type, value: Number(this.value) } : {}),
      note: this.note.trim() || null,
    }).pipe(finalize(() => this.busy.set(null))).subscribe({
      next: (res: any) => {
        this.toast.success(res?.message || 'Saved.');
        this.dialogRef.close(true);
      },
      error: (err: any) => {
        const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
        this.formError.set(first || err?.error?.message || 'Could not save the decision. Please try again.');
        // Someone else may have decided it meanwhile: show the current state.
        if (err?.status === 422 && /already/i.test(err?.error?.message ?? '')) this.load();
      },
    });
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
