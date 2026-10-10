import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { FlowAppointmentRecord, Sitting, SittingPhoto, inr } from '../../../shared/models/appointment-flow.model';

/** Roles allowed to write the doctor's session notes (matches the API). */
const DOCTOR_ROLES = ['doctor', 'super_admin', 'admin'];

interface SittingDraft {
  date: string;
  time: string;
  notes: string;
  rescheduling: boolean;
}

/**
 * A converted customer's treatment sittings: before / after photos for every sitting, the doctor's notes
 * on how the session went, rescheduling an upcoming sitting and marking it completed.
 */
@Component({
  selector: 'app-sittings-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
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
  readonly appt = signal<FlowAppointmentRecord | null>(null);
  readonly sittings = signal<Sitting[]>([]);
  readonly busy = signal<number | null>(null);
  readonly viewer = signal<{ photos: SittingPhoto[]; index: number } | null>(null);
  drafts: Record<number, SittingDraft> = {};

  readonly today = new Date().toISOString().slice(0, 10);
  readonly isDoctor = computed(() => DOCTOR_ROLES.includes(String(this.auth.currentUser()?.role?.slug ?? '')));
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
      this.drafts[s.id] ??= { date: s.scheduled_date ?? '', time: (s.scheduled_time ?? '').slice(0, 5), notes: s.notes ?? '', rescheduling: false };
    }
  }

  /** Replaces one sitting with the API's fresh copy. */
  private patch(updated: Sitting): void {
    this.sittings.update(list => list.map(s => (s.id === updated.id ? updated : s)));
    this.drafts[updated.id] = { date: updated.scheduled_date ?? '', time: (updated.scheduled_time ?? '').slice(0, 5), notes: updated.notes ?? '', rescheduling: false };
  }

  photos(s: Sitting, type: 'before' | 'after'): SittingPhoto[] {
    return s.photos.filter(p => p.type === type);
  }

  /** The next sitting that is still open - highlighted in the list. */
  get nextOpenId(): number | null {
    return this.sittings().find(s => s.status !== 'completed')?.id ?? null;
  }

  upload(s: Sitting, type: 'before' | 'after', input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []).filter(f => f.type.startsWith('image/'));
    input.value = '';
    if (!files.length) return;
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
    const notes = this.drafts[s.id].notes.trim();
    if (!notes) return void this.toast.error('Write how the session went.');
    this.run(s.id, this.api.PUT(`${ApiRoutesConstants.SITTINGS}/${s.id}/notes`, { notes }));
  }

  reschedule(s: Sitting): void {
    const d = this.drafts[s.id];
    if (!d.date || d.date < this.today) return void this.toast.error('Pick today or a later date.');
    this.run(s.id, this.api.PUT(`${ApiRoutesConstants.SITTINGS}/${s.id}/reschedule`, { scheduled_date: d.date, scheduled_time: d.time || null }));
  }

  complete(s: Sitting): void {
    this.run(s.id, this.api.POST(`${ApiRoutesConstants.SITTINGS}/${s.id}/complete`, {}));
  }

  private run(id: number, request: any): void {
    this.busy.set(id);
    request.pipe(finalize(() => this.busy.set(null))).subscribe({
      next: (res: any) => {
        this.patch(res.data);
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
