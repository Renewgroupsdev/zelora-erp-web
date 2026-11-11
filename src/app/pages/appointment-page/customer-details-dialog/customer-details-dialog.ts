import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { FlowAppointmentRecord, FlowDocument, SittingPhoto, SittingTransferInfo, inr, statusLabel } from '../../../shared/models/appointment-flow.model';
import { PageLoader } from '../../../shared/components/page-loader/page-loader';
import { HairGradeIcon } from '../../../shared/components/hair-grade-icon/hair-grade-icon';

interface DetailItem {
  label: string;
  value: string;
}

/** One sitting as the profile shows it (current or earlier treatment alike). */
interface SittingView {
  id: number;
  sitting_no: number;
  status: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  actual_date: string | null;
  notes?: string | null;
  doctor?: { id: number; name: string } | null;
  photos: SittingPhoto[];
  transfer_info?: SittingTransferInfo | null;
}

/** One treatment of the customer with its sittings and their before / after photos. */
interface TreatmentView {
  id: number;
  name: string;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  done: number;
  total: number;
  amount: number;
  sittings: SittingView[];
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
  private readonly auth = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<CustomerDetailsDialog>);
  private readonly data = inject<{ appointmentId: number }>(MAT_DIALOG_DATA);
  protected readonly appointmentId = this.data.appointmentId;

  readonly inr = inr;
  readonly statusLabel = statusLabel;
  readonly appt = signal<FlowAppointmentRecord | null>(null);
  readonly viewer = signal<{ photos: SittingPhoto[]; index: number } | null>(null);

  /**
   * Every treatment the customer has had, current first: each with its sittings and their before / after photos.
   * Falls back to the appointment's own plan when the customer has no treatment history.
   */
  readonly treatments = computed<TreatmentView[]>(() => {
    const a = this.appt();
    if (!a) return [];
    const byNo = (x: SittingView, y: SittingView) => x.sitting_no - y.sitting_no;
    const history = (a.treatment_history ?? []).map(t => ({
      id: t.id, name: t.treatment ?? 'Treatment', active: t.status === 'active', start_date: t.start_date, end_date: t.end_date,
      done: t.completed_sittings, total: t.sittings_count, amount: t.net_amount,
      sittings: t.sittings.map(x => ({ ...x, photos: x.photos ?? [] }) as SittingView).sort(byNo),
    }));
    if (history.length) return history.sort((x, y) => Number(y.active) - Number(x.active));
    const plan = a.customer_treatment;
    if (!plan) return [];
    const sittings = [...plan.sittings].sort(byNo);
    return [{
      id: plan.id, name: plan.treatment?.name ?? a.treatment?.name ?? 'Treatment', active: plan.completed_sittings < plan.sittings_count,
      start_date: null, end_date: null, done: plan.completed_sittings, total: plan.sittings_count, amount: Number(a.total_amount ?? 0), sittings,
    }];
  });
  readonly totalPhotos = computed(() => this.treatments().reduce((n, t) => n + t.sittings.reduce((m, s) => m + s.photos.length, 0), 0));
  /** Photos that failed to load: shown as a neutral placeholder instead of a broken-image icon. */
  readonly brokenPhotos = signal<ReadonlySet<number>>(new Set());
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
      ['Branch / Franchise', a.branch_name ?? a.branch?.name],
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

  /** Patient documents are private: load through the API (with the login token) as a blob and open it in a new tab. */
  viewDocument(doc: FlowDocument, event: Event): void {
    event.preventDefault();
    const tab = window.open('', '_blank'); // opened before the request so the popup blocker allows it
    this.api.GET_BLOB(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/documents/${doc.id}`).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(doc.mime ? new Blob([blob], { type: doc.mime }) : blob);
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        tab?.close();
        this.toast.error('Could not open the document.');
      },
    });
  }

  get canInvoice(): boolean {
    return this.auth.hasActionAccess('download-invoice');
  }

  /** Loads the tax invoice as a blob and opens it in a new tab. */
  viewInvoice(): void {
    const tab = window.open('', '_blank'); // opened before the request so the popup blocker allows it
    this.api.GET_BLOB(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}/invoice`).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        tab?.close();
        this.toast.error('Could not open the invoice.');
      },
    });
  }

  markBroken(id: number): void {
    this.brokenPhotos.update(set => new Set(set).add(id));
  }

  progress(t: TreatmentView): number {
    return t.total ? Math.min(100, Math.round((t.done / t.total) * 100)) : 0;
  }

  paidPercent(): number {
    const a = this.appt();
    const total = Number(a?.total_amount ?? 0);
    return total ? Math.min(100, Math.round((Number(a?.paid_amount ?? 0) / total) * 100)) : 0;
  }

  photos(s: { photos: SittingPhoto[] }, type: 'before' | 'after'): SittingPhoto[] {
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
