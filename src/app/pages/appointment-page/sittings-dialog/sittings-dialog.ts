import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { PageLoader } from '../../../shared/components/page-loader/page-loader';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { FlowAppointmentRecord, PAYMENT_MODES, PaymentMode, Sitting, SittingPhoto, inr } from '../../../shared/models/appointment-flow.model';

/** Module action whose roles may write the doctor's session notes - assigned in Roles & Permissions (the API checks the same). */
const SITTING_NOTES_ACTION = 'sitting-notes';

interface SittingDraft {
  date: string;
  time: string;
  notes: string;
  rescheduling: boolean;
  paying: boolean;
  payMode: PaymentMode;
  payAmount: number | null;
  payTxn: string;
}

/**
 * A converted customer's treatment sittings: before / after photos for every sitting, the doctor's notes
 * on how the session went, rescheduling an upcoming sitting and marking it completed.
 * Each sitting is worked in order - before photos, after photos, doctor notes, this sitting's payment -
 * and completing it takes the treatment materials out of the branch stock (the API enforces all of it).
 */
@Component({
  selector: 'app-sittings-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, PageLoader, CanActionDirective],
  templateUrl: './sittings-dialog.html',
  styleUrls: ['../../../shared/styles/erp-dialog.scss', './sittings-dialog.scss'],
})
export class SittingsDialog implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = inject(MatDialogRef<SittingsDialog>);
  private readonly data = inject<{ appointmentId: number }>(MAT_DIALOG_DATA);

  readonly inr = inr;
  readonly paymentModes = PAYMENT_MODES;
  readonly appt = signal<FlowAppointmentRecord | null>(null);
  readonly sittings = signal<Sitting[]>([]);
  readonly busy = signal<number | null>(null);
  readonly viewer = signal<{ photos: SittingPhoto[]; index: number } | null>(null);
  drafts: Record<number, SittingDraft> = {};

  readonly today = new Date().toISOString().slice(0, 10);
  readonly isDoctor = computed(() => this.auth.hasActionAccess(SITTING_NOTES_ACTION));
  /** Roles & Permissions -> Appointment module action ticked for the signed-in role. */
  can(action: string): boolean {
    return this.auth.hasActionAccess(action);
  }

  readonly completed = computed(() => this.sittings().filter(s => s.status === 'completed').length);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}`).subscribe({
      next: (res: any) => {
        const a: FlowAppointmentRecord = res.data;
        this.appt.set(a);
        this.setSittings(a.customer_treatment?.sittings ?? []);
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Could not load the sittings.');
        this.dialogRef.close();
      },
    });
  }

  private setSittings(list: Sitting[]): void {
    this.sittings.set([...list].sort((a, b) => a.sitting_no - b.sitting_no));
    for (const s of list) {
      this.drafts[s.id] = { ...this.freshDraft(s), notes: this.drafts[s.id]?.notes ?? s.notes ?? '' };
    }
  }

  private freshDraft(s: Sitting): SittingDraft {
    return {
      date: s.scheduled_date ?? '',
      time: (s.scheduled_time ?? '').slice(0, 5),
      notes: s.notes ?? '',
      rescheduling: false,
      paying: false,
      payMode: 'Cash',
      payAmount: s.requirements?.amount_due || null,
      payTxn: '',
    };
  }

  /** Replaces one sitting with the API's fresh copy. */
  private patch(updated: Sitting): void {
    this.sittings.update(list => list.map(s => (s.id === updated.id ? updated : s)));
    this.drafts[updated.id] = this.freshDraft(updated);
  }

  photos(s: Sitting, type: 'before' | 'after'): SittingPhoto[] {
    return s.photos.filter(p => p.type === type);
  }

  hasPhotos(s: Sitting, type: 'before' | 'after'): boolean {
    return s.photos.some(p => p.type === type);
  }

  /** Sittings are worked strictly in order: only the next open one is enabled, later ones wait. */
  isLocked(s: Sitting): boolean {
    return s.status !== 'completed' && s.id !== this.nextOpenId;
  }

  /** The sitting this one is waiting for (shown on locked cards). */
  waitingFor(s: Sitting): number | null {
    return this.isLocked(s) ? (this.sittings().find(x => x.id === this.nextOpenId)?.sitting_no ?? null) : null;
  }

  /** After photos only once there is a before photo; notes only once there are after photos. */
  canUpload(s: Sitting, type: 'before' | 'after'): boolean {
    return s.status !== 'completed' && !this.isLocked(s) && (type === 'before' || this.hasPhotos(s, 'before'));
  }

  canWriteNotes(s: Sitting): boolean {
    return s.status !== 'completed' && !this.isLocked(s) && this.hasPhotos(s, 'after');
  }

  shortMaterials(s: Sitting) {
    return (s.requirements?.materials ?? []).filter(m => m.available < m.needed);
  }

  /** Why "Mark completed" is not available yet - empty when the sitting can be completed. */
  blockers(s: Sitting): string[] {
    if (this.isLocked(s)) return [`Complete sitting ${this.waitingFor(s)} first`];
    const r = s.requirements;
    const out: string[] = [];
    if (!this.hasPhotos(s, 'before')) out.push('Add before photos');
    if (!this.hasPhotos(s, 'after')) out.push('Add after photos');
    if (!(s.notes ?? '').trim()) out.push('Save the doctor notes');
    if (r && r.amount_due > 0) out.push(`Collect ${inr(r.amount_due)} for this sitting`);
    for (const m of this.shortMaterials(s)) out.push(`${m.name}: need ${m.needed}, only ${m.available} in stock`);
    return out;
  }

  /** The next sitting that is still open - highlighted in the list. */
  get nextOpenId(): number | null {
    return this.sittings().find(s => s.status !== 'completed')?.id ?? null;
  }

  upload(s: Sitting, type: 'before' | 'after', input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []).filter(f => f.type.startsWith('image/'));
    input.value = '';
    if (!files.length) return;
    if (this.isLocked(s)) return void this.toast.error(`Complete sitting ${this.waitingFor(s)} first.`);
    if (!this.canUpload(s, type)) return void this.toast.error('Add the before photos first.');
    if (files.some(f => f.size > 4 * 1024 * 1024)) return void this.toast.error('Each photo must be 4 MB or smaller.');

    const body = new FormData();
    body.append('type', type);
    files.forEach(f => body.append('photos[]', f));
    this.run(s.id, this.api.POST(`${ApiRoutesConstants.SITTINGS}/${s.id}/photos`, body));
  }

  deletePhoto(s: Sitting, photo: SittingPhoto): void {
    this.run(s.id, this.api.Delete(`${ApiRoutesConstants.SITTING_PHOTOS}/${photo.id}`, {}));
  }

  saveNotes(s: Sitting): void {
    if (!this.canWriteNotes(s)) return void this.toast.error('Add the before and after photos before saving the notes.');
    const notes = this.drafts[s.id].notes.trim();
    if (!notes) return void this.toast.error('Write how the session went.');
    this.run(s.id, this.api.PUT(`${ApiRoutesConstants.SITTINGS}/${s.id}/notes`, { notes }));
  }

  reschedule(s: Sitting): void {
    const d = this.drafts[s.id];
    if (!d.date || d.date < this.today) return void this.toast.error('Pick today or a later date.');
    this.run(s.id, this.api.PUT(`${ApiRoutesConstants.SITTINGS}/${s.id}/reschedule`, { scheduled_date: d.date, scheduled_time: d.time || null }));
  }

  collectPayment(s: Sitting): void {
    if (this.isLocked(s)) return void this.toast.error(`Complete sitting ${this.waitingFor(s)} first.`);
    const d = this.drafts[s.id];
    const amount = Number(d.payAmount);
    const balance = s.requirements?.balance ?? Infinity;
    if (!amount || amount <= 0) return void this.toast.error('Enter the amount received.');
    if (amount > balance) return void this.toast.error(`Only ${inr(balance)} is left to pay on this treatment.`);
    if (d.payMode !== 'Cash' && !d.payTxn.trim()) return void this.toast.error('Enter the transaction / reference number.');

    // A payment changes what every later sitting still owes (and the header total), so reload them all.
    this.run(s.id, this.api.POST(`${ApiRoutesConstants.SITTINGS}/${s.id}/payment`, {
      payment_mode: d.payMode,
      paid_amount: amount,
      transaction_no: d.payTxn.trim() || null,
    }), true);
  }

  complete(s: Sitting): void {
    const blockers = this.blockers(s);
    if (blockers.length) return void this.toast.error(blockers[0]);
    // Completing takes materials out of the branch store, which changes stock for the other sittings too.
    this.run(s.id, this.api.POST(`${ApiRoutesConstants.SITTINGS}/${s.id}/complete`, {}), true);
  }

  private run(id: number, request: any, reloadAll = false): void {
    this.busy.set(id);
    request.pipe(finalize(() => this.busy.set(null))).subscribe({
      next: (res: any) => {
        reloadAll ? this.load() : this.patch(res.data);
        this.toast.success(res?.message || 'Saved.');
      },
      error: (err: any) => {
        const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
        this.toast.error(first || err?.error?.message || 'Could not save.');
      },
    });
  }

  openViewer(photos: SittingPhoto[], index: number): void {
    this.viewer.set({ photos, index });
  }

  step(delta: number): void {
    const v = this.viewer();
    if (!v) return;
    this.viewer.set({ ...v, index: (v.index + delta + v.photos.length) % v.photos.length });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '-';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
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
