import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { PageLoader } from '../../../shared/components/page-loader/page-loader';
import { FlowAppointmentRecord, inr } from '../../../shared/models/appointment-flow.model';

/**
 * Nill Card -> View: a consultation where the customer did not take the treatment and only paid the consultation fee.
 * Read only: last visit, the fee collected, the customer's basic details and the treatment that was suggested.
 */
@Component({
  selector: 'app-nill-card-view',
  standalone: true,
  imports: [CommonModule, MatDialogModule, PageLoader],
  templateUrl: './nill-card-view.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', './nill-card-view.scss'],
})
export class NillCardView implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly dialogRef = inject(MatDialogRef<NillCardView>);
  private readonly data = inject<{ appointmentId: number }>(MAT_DIALOG_DATA);

  readonly inr = inr;
  readonly Number = Number;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly appt = signal<FlowAppointmentRecord | null>(null);

  /** The treatments suggested in the consultation (each with its own sittings and price). */
  readonly lines = computed(() => {
    const a = this.appt();
    if (!a) return [];
    if (a.treatment_lines?.length) {
      return a.treatment_lines.map(l => ({
        name: l.treatment?.name ?? 'Treatment', price: Number(l.price_per_sitting), sittings: Number(l.sittings_count),
        gap: Number(l.sitting_interval_days), amount: Number(l.total_amount),
      }));
    }
    return a.treatment_id
      ? [{ name: a.treatment?.name ?? 'Treatment', price: Number(a.price_per_sitting), sittings: Number(a.sittings_count), gap: Number(a.sitting_interval_days), amount: Number(a.total_amount) }]
      : [];
  });

  readonly code = computed(() => {
    const a = this.appt();
    return a ? a.customer?.customer_code ?? `AP-${String(a.id).padStart(5, '0')}` : '';
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}`)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res: any) => this.appt.set(res?.data ?? null),
        error: (err: any) => this.error.set(err?.error?.message || 'Could not load this record.'),
      });
  }

  modeLabel(mode: string | null | undefined): string {
    return mode === 'Online' ? 'Internet Banking' : mode || '-';
  }

  date(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso.length > 10 ? iso : `${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  dateTime(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  time(hhmm: string | null | undefined): string {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h)) return hhmm;
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  /** Days since the last visit, for the "Last visit" tile. */
  sinceLastVisit(iso: string | null | undefined): string {
    if (!iso) return '';
    const days = Math.floor((Date.now() - new Date(`${iso.slice(0, 10)}T00:00:00`).getTime()) / 86400000);
    if (Number.isNaN(days) || days < 0) return '';
    return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
  }

  close(): void {
    this.dialogRef.close();
  }
}
