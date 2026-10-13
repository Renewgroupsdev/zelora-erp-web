import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { FlowAppointmentRecord, Sitting, SittingPhoto, inr } from '../../../shared/models/appointment-flow.model';
import { PageLoader } from '../../../shared/components/page-loader/page-loader';
import { HairGradeIcon } from '../../../shared/components/hair-grade-icon/hair-grade-icon';

interface DetailItem {
  label: string;
  value: string;
}

/**
 * Read-only view of everything known about an appointment's customer: personal details, the visit,
 * the clinical examination, documents, billing / payments and the treatment sittings. Nothing here
 * can be edited - the consultation form and the sittings dialog stay the places for changes.
 */
@Component({
  selector: 'app-customer-details-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, PageLoader, HairGradeIcon],
  templateUrl: './customer-details-dialog.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', './customer-details-dialog.scss'],
})
export class CustomerDetailsDialog implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = inject(MatDialogRef<CustomerDetailsDialog>);
  private readonly data = inject<{ appointmentId: number }>(MAT_DIALOG_DATA);

  readonly inr = inr;
  readonly appt = signal<FlowAppointmentRecord | null>(null);
  readonly viewer = signal<{ photos: SittingPhoto[]; index: number } | null>(null);

  readonly sittings = computed<Sitting[]>(() =>
    [...(this.appt()?.customer_treatment?.sittings ?? [])].sort((a, b) => a.sitting_no - b.sitting_no));
  readonly completedSittings = computed(() => this.sittings().filter(s => s.status === 'completed').length);
  /** The customer's other (earlier) treatments - view only. */
  readonly previousTreatments = computed(() =>
    (this.appt()?.treatment_history ?? []).filter(t => t.id !== this.appt()?.customer_treatment?.id));
  readonly balance = computed(() => Math.max(0, Number(this.appt()?.total_amount ?? 0) - Number(this.appt()?.paid_amount ?? 0)));

  readonly initials = computed(() =>
    (this.appt()?.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''));

  readonly personal = computed<DetailItem[]>(() => {
    const a = this.appt();
    if (!a) return [];
    const c = a.customer;
    return this.present([
      ['Customer code', c?.customer_code],
      ['Mobile', a.mobile_no],
      ['Alternate mobile', c?.alternate_mobile_no],
      ['Email', c?.email ?? a.email],
      ['Gender', c?.gender ?? a.gender],
      ['Age', a.age],
      ['Date of birth', this.formatDate(c?.date_of_birth)],
      ['Occupation', c?.occupation],
      ['Address', [c?.address ?? a.location, c?.city, c?.state].filter(Boolean).join(', ')],
      ['Pincode', c?.pincode ?? a.pincode],
      ['Heard about us', c?.referred_by ?? a.heard_from],
      ['Lead source', a.lead?.source?.source_name],
      ['Customer since', this.formatDate(c?.created_at)],
    ]);
  });

  readonly visit = computed<DetailItem[]>(() => {
    const a = this.appt();
    if (!a) return [];
    return this.present([
      ['Appointment', `${this.formatDate(a.appointment_date)} ${this.formatTime(a.appointment_time)}`.trim()],
      ['Branch', a.branch?.name],
      ['Counselor', a.counselor?.name],
      ['Category', a.category ?? a.lead?.service_category?.name],
      ['Treatment', a.treatment?.name],
      ['Sittings', a.sittings_count ? `${a.sittings_count} (every ${a.sitting_interval_days} days)` : null],
      ['Price per sitting', a.price_per_sitting ? inr(a.price_per_sitting) : null],
    ]);
  });

  readonly clinical = computed<DetailItem[]>(() => {
    const a = this.appt();
    if (!a) return [];
    return [
      ...this.present([
        ['Blood pressure', a.bp],
        ['Weight', a.weight ? `${a.weight} kg` : null],
        ['Allergy', a.is_allergy ? 'Yes' : 'No'],
      ]),
      ...this.flatten(a.consultation ?? {}),
    ];
  });

  ngOnInit(): void {
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}`).subscribe({
      next: (res: any) => this.appt.set(res.data),
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Could not load the customer details.');
        this.dialogRef.close();
      },
    });
  }

  photos(s: Sitting, type: 'before' | 'after'): SittingPhoto[] {
    return s.photos.filter(p => p.type === type);
  }

  openViewer(photos: SittingPhoto[], index: number): void {
    this.viewer.set({ photos, index });
  }

  step(delta: number): void {
    const v = this.viewer();
    if (!v) return;
    this.viewer.set({ ...v, index: (v.index + delta + v.photos.length) % v.photos.length });
  }

  /** Drops empty values so the view only lists what was actually recorded. */
  private present(rows: [string, unknown][]): DetailItem[] {
    return rows
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(([label, v]) => ({ label, value: String(v) }));
  }

  /** The consultation JSON (camelCase keys, lists, nested groups like hairPull) as label / value rows. */
  private flatten(obj: Record<string, any>, prefix = ''): DetailItem[] {
    const out: DetailItem[] = [];
    for (const [key, value] of Object.entries(obj)) {
      const label = prefix ? `${prefix} - ${this.humanize(key)}` : this.humanize(key);
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value)) {
        if (value.length) out.push({ label, value: value.join(', ') });
      } else if (typeof value === 'object') {
        out.push(...this.flatten(value, label));
      } else if (typeof value === 'boolean') {
        out.push({ label, value: value ? 'Yes' : 'No' });
      } else {
        out.push({ label, value: String(value) });
      }
    }
    return out;
  }

  private humanize(key: string): string {
    const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  formatTime(t: string | null | undefined): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  close(): void {
    this.dialogRef.close();
  }
}
