import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CustomerPaymentsDialog } from '../../customer-portal-page/customer-payments-dialog/customer-payments-dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { BranchOptionsService, parseUnitKey } from '../../../shared/common-services/branch-options.service';
import { SlotPicker } from '../../customer-portal-page/add-treatment-dialog/slot-picker';
import { PageLoader } from '../../../shared/components/page-loader/page-loader';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { FlowAppointmentRecord, FlowCustomerTreatment, Sitting, SittingPhoto, inr } from '../../../shared/models/appointment-flow.model';

/** Module action whose roles may write the doctor's session notes - assigned in Roles & Permissions (the API checks the same). */
const SITTING_NOTES_ACTION = 'sitting-notes';

interface SittingDraft {
  date: string;
  time: string;
  /** "branch:9" / "franchise:7": hold the sitting there; '' = leave it where it is. */
  branchKey: string;
  notes: string;
  rescheduling: boolean;
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
  styleUrls: ['../../../shared/styles/erp-dialog.scss', '../new-appointment-dialog/new-appointment-dialog.scss', './sittings-dialog.scss'],
})
export class SittingsDialog implements OnInit, OnDestroy {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<SittingsDialog>);
  private readonly data = inject<{ appointmentId: number }>(MAT_DIALOG_DATA);
  private readonly branchOptions = inject(BranchOptionsService);

  /** Branches / franchises a pending sitting can be moved to. */
  readonly branches = signal<{ key: string; name: string }[]>([]);

  readonly inr = inr;
  readonly appt = signal<FlowAppointmentRecord | null>(null);
  /** The sittings shown: those of the treatment picked in the tabs (a consultation can have several treatments). */
  readonly sittings = signal<Sitting[]>([]);
  /** Every treatment plan of the consultation, each with its own sittings. */
  readonly plans = signal<FlowCustomerTreatment[]>([]);
  readonly activePlanId = signal<number | null>(null);
  readonly activePlan = computed(() => this.plans().find(p => p.id === this.activePlanId()) ?? null);
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
  /** Share of the shown treatment's sittings that are completed (header ring). */
  readonly percent = computed(() => (this.sittings().length ? Math.round((this.completed() / this.sittings().length) * 100) : 0));

  ngOnInit(): void {
    this.branchOptions.load().subscribe(list => this.branches.set(list.map(b => ({ key: b.key, name: b.name }))));
    this.load();
    // A transfer waits for the other branch's manager: while one is pending, check often so the answer (accepted / rejected) shows at once.
    this.pollTimer = setInterval(() => this.pollTransfers(), 8000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Ids of the pending transfer requests across every treatment of the appointment. */
  private pendingSignature(a: FlowAppointmentRecord | null): string {
    const plans = a?.customer_treatments?.length ? a.customer_treatments : a?.customer_treatment ? [a.customer_treatment] : [];
    return plans.flatMap(p => p.sittings.map(s => s.transfer_request?.id ?? 0)).join(',');
  }

  private pollTransfers(): void {
    if (document.visibilityState === 'hidden' || !this.sittings().some(s => s.transfer_request)) return;
    const before = this.pendingSignature(this.appt());
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}`).subscribe({
      next: (res: any) => {
        if (this.pendingSignature(res.data) === before) return;
        this.toast.success('The other branch answered the transfer request - the sittings are updated.');
        this.load();
      },
      error: () => undefined,
    });
  }

  private load(after?: () => void): void {
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.appointmentId}`).subscribe({
      next: (res: any) => {
        const a: FlowAppointmentRecord = res.data;
        this.appt.set(a);
        // One plan per treatment; an older appointment only has its single plan.
        const plans: FlowCustomerTreatment[] = a.customer_treatments?.length
          ? a.customer_treatments
          : a.customer_treatment
            ? [{
              id: a.customer_treatment.id,
              treatment: a.customer_treatment.treatment ?? (a.treatment ? { id: a.treatment.id, name: a.treatment.name } : null),
              status: 'active', sittings_count: a.customer_treatment.sittings_count, completed_sittings: a.customer_treatment.completed_sittings,
              net_amount: 0, sittings: a.customer_treatment.sittings,
            }]
            : [];
        this.plans.set(plans);
        // Stay on the treatment being worked on after a reload; otherwise open the first one that still has sittings to do.
        const current = plans.find(p => p.id === this.activePlanId()) ?? plans.find(p => p.sittings.some(s => s.status !== 'completed')) ?? plans[0];
        this.activePlanId.set(current?.id ?? null);
        this.setSittings(current?.sittings ?? []);
        after?.();
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
      branchKey: '',
      notes: s.notes ?? '',
      rescheduling: false,
    };
  }

  /** More sittings on the treatment shown (POST customer-treatments/{id}/sittings). */
  extra = { open: false, count: 1, interval: 7, start_date: '' };

  /** Slot + doctor picker of the extra sittings (same as Add Appointment): free slots of the day, then the doctors free at that slot. */
  readonly extraSlots = new SlotPicker(this.api, this.today, () => {
    const a = this.appt();
    return a?.branch_type && a.branch_id ? `&branch_type=${encodeURIComponent(a.branch_type)}&branch_id=${a.branch_id}` : '';
  });

  toggleExtra(): void {
    this.extra.open = !this.extra.open;
    if (!this.extra.open) return;
    this.extra = { ...this.extra, start_date: this.today, interval: this.appt()?.sitting_interval_days || 7 };
    this.extraSlots.reset();
    this.extraSlots.setDate(this.extra.start_date);
  }

  onExtraDateChange(): void {
    this.extraSlots.setDate(this.extra.start_date);
  }

  addSittings(): void {
    const plan = this.activePlan();
    if (!plan) return;
    const count = Number(this.extra.count);
    if (!(count >= 1 && count <= 50)) return void this.toast.error('Add between 1 and 50 sittings.');
    if (!(Number(this.extra.interval) >= 1)) return void this.toast.error('The gap between sittings must be at least 1 day.');
    if (!this.extra.start_date || this.extra.start_date < this.today) return void this.toast.error('Pick today or a later date for the first extra sitting.');
    this.run(-1, this.api.POST(`${ApiRoutesConstants.CUSTOMER_TREATMENTS}/${plan.id}/sittings`, {
      count,
      sitting_interval_days: Number(this.extra.interval),
      start_date: this.extra.start_date,
      start_time: this.extraSlots.time || null,
      doctor_id: this.extraSlots.doctorId,
    }), true);
    this.extra.open = false;
  }

  selectPlan(id: number): void {
    const plan = this.plans().find(p => p.id === id);
    if (!plan || plan.id === this.activePlanId()) return;
    this.activePlanId.set(plan.id);
    this.setSittings(plan.sittings);
  }

  /** Sittings of a treatment that are completed (for its tab). */
  planDone(plan: FlowCustomerTreatment): number {
    return plan.sittings.filter(s => s.status === 'completed').length;
  }

  /** Replaces one sitting with the API's fresh copy. */
  private patch(updated: Sitting): void {
    this.sittings.update(list => list.map(s => (s.id === updated.id ? updated : s)));
    this.plans.update(plans => plans.map(p => ({ ...p, sittings: p.sittings.map(s => (s.id === updated.id ? updated : s)) })));
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
  /** The doctor's notes are saved: the photos and notes of the sitting are then locked (only the payment and completing are left). */
  notesSaved(s: Sitting): boolean {
    return s.status !== 'completed' && (s.notes ?? '').trim() !== '';
  }

  /** Photos can be added / removed: not once the sitting is completed, or its notes are saved. */
  photosEditable(s: Sitting): boolean {
    return s.status !== 'completed' && this.can('sitting-photos') && !this.notesSaved(s);
  }

  canUpload(s: Sitting, type: 'before' | 'after'): boolean {
    return s.status !== 'completed' && !this.notesSaved(s) && !this.isLocked(s) && (type === 'before' || this.hasPhotos(s, 'before'));
  }

  canWriteNotes(s: Sitting): boolean {
    return s.status !== 'completed' && !this.notesSaved(s) && !this.isLocked(s) && this.hasPhotos(s, 'after');
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
    if (r && r.amount_due > 0) out.push(`Last sitting: collect the pending balance ${inr(r.amount_due)} from Customer Payments`);
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
    if (this.notesSaved(s)) return void this.toast.error('The notes are saved, so the photos are locked.');
    if (!this.canUpload(s, type)) return void this.toast.error('Add the before photos first.');
    if (files.some(f => f.size > 4 * 1024 * 1024)) return void this.toast.error('Each photo must be 4 MB or smaller.');

    const body = new FormData();
    body.append('type', type);
    files.forEach(f => body.append('photos[]', f));
    this.run(s.id, this.api.POST(`${ApiRoutesConstants.SITTINGS}/${s.id}/photos`, body));
  }

  deletePhoto(s: Sitting, photo: SittingPhoto): void {
    if (this.notesSaved(s)) return void this.toast.error('The notes are saved, so the photos are locked.');
    this.run(s.id, this.api.Delete(`${ApiRoutesConstants.SITTING_PHOTOS}/${photo.id}`, {}));
  }

  saveNotes(s: Sitting): void {
    if (!this.canWriteNotes(s)) return void this.toast.error('Add the before and after photos before saving the notes.');
    const notes = this.drafts[s.id].notes.trim();
    if (!notes) return void this.toast.error('Write how the session went.');
    // Saving the notes is the last step of a sitting: when nothing else is outstanding it is completed straight away.
    this.run(s.id, this.api.PUT(`${ApiRoutesConstants.SITTINGS}/${s.id}/notes`, { notes }), false, () => this.completeAfterNotes(s.id));
  }

  /** After the notes are saved: complete the sitting if every requirement is met, else say what is still needed. */
  private completeAfterNotes(id: number): void {
    const fresh = this.sittings().find(x => x.id === id);
    if (!fresh || fresh.status === 'completed' || !this.can('sitting-complete')) return;
    const left = this.blockers(fresh);
    if (left.length) return void this.explainBlockers(fresh, left);
    this.complete(fresh);
  }

  /**
   * Alert after the notes: what is still needed. Payment is optional at every sitting except the last, which cannot be
   * completed until the whole balance is paid - then the alert offers "Collect payment" (the customer's Payments dialog).
   */
  private explainBlockers(s: Sitting, left: string[]): void {
    const title = `Notes saved. To complete this sitting: ${left.join(' · ')}`;
    const customerId = this.appt()?.customer_id;
    const paymentPending = (s.requirements?.amount_due ?? 0) > 0;
    if (!paymentPending || !customerId || !this.can('sitting-payment')) return void this.toast.warning(title);
    void this.toast.action('warning', title, 'This is the last sitting: it can be completed only after the full balance is paid.', 'Collect payment').then(choice => {
      if (choice === 'action') this.openPayments(customerId, s.id);
    });
  }

  /**
   * Customer Payments dialog: collect the pending payment here. When it closes the sittings reload and, if the payment
   * cleared the last blocker of `sittingId`, that sitting is completed straight away.
   */
  openPayments(customerId: number, sittingId?: number): void {
    this.dialog.open(CustomerPaymentsDialog, {
      width: '860px', maxWidth: 'calc(100vw - 24px)', maxHeight: '94vh', autoFocus: false, restoreFocus: true,
      data: { id: customerId, name: this.appt()?.name ?? '' },
    }).afterClosed().subscribe(() => this.load(sittingId ? () => this.completeIfReady(sittingId) : undefined));
  }

  /** Completes the sitting when nothing is outstanding any more (no alert when something still is - the payment may be partial). */
  private completeIfReady(id: number): void {
    const fresh = this.sittings().find(x => x.id === id);
    if (!fresh || fresh.status === 'completed' || !this.can('sitting-complete') || !this.notesSaved(fresh)) return;
    if (this.blockers(fresh).length) return;
    this.complete(fresh);
  }


  /** Slot + doctor picker of one sitting's reschedule form (same as Add Appointment). Slots are those of the branch that will hold the sitting. */
  private readonly pickers: Record<number, SlotPicker> = {};

  picker(s: Sitting): SlotPicker {
    return this.pickers[s.id] ??= new SlotPicker(this.api, this.today, () => {
      const unit = parseUnitKey(this.drafts[s.id]?.branchKey ?? '');
      if (unit) return `&branch_type=${unit.type}&branch_id=${unit.id}`;
      const a = this.appt();
      const type = s.branch_type ?? a?.branch_type;
      const id = s.branch_id ?? a?.branch_id;
      return type && id ? `&branch_type=${encodeURIComponent(type)}&branch_id=${id}` : '';
    });
  }

  toggleReschedule(s: Sitting): void {
    const d = this.drafts[s.id];
    d.rescheduling = !d.rescheduling;
    if (!d.rescheduling) return;
    if (!d.date || d.date < this.today) d.date = this.today;
    const p = this.picker(s);
    p.reset();
    p.setDate(d.date);
  }

  /** New date or a different branch: the free slots and doctors are looked up again. */
  onRescheduleChange(s: Sitting): void {
    this.picker(s).setDate(this.drafts[s.id].date);
  }

  reschedule(s: Sitting): void {
    const d = this.drafts[s.id];
    if (!d.date || d.date < this.today) return void this.toast.error('Pick today or a later date.');
    const p = this.picker(s);
    // A branch picked here asks that branch's manager to take the sitting (it moves only when accepted); '' keeps it where it is.
    const unit = parseUnitKey(d.branchKey);
    this.run(s.id, this.api.PUT(`${ApiRoutesConstants.SITTINGS}/${s.id}/reschedule`, {
      scheduled_date: d.date, scheduled_time: p.time || null,
      ...(unit ? { branch_type: unit.type, branch_id: unit.id } : { doctor_id: p.doctorId }),
    }));
    d.rescheduling = false;
  }

  /** Withdraws a transfer request the other branch has not answered yet. */
  cancelTransfer(s: Sitting): void {
    if (!s.transfer_request) return;
    this.run(s.id, this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/sitting-transfers/${s.transfer_request.id}/cancel`, {}));
  }

  complete(s: Sitting): void {
    const blockers = this.blockers(s);
    if (blockers.length) return void this.toast.error(blockers[0]);
    // Completing takes materials out of the branch store, which changes stock for the other sittings too.
    this.run(s.id, this.api.POST(`${ApiRoutesConstants.SITTINGS}/${s.id}/complete`, {}), true);
  }

  private run(id: number, request: any, reloadAll = false, after?: (res: any) => void): void {
    this.busy.set(id);
    request.pipe(finalize(() => this.busy.set(null))).subscribe({
      next: (res: any) => {
        reloadAll ? this.load() : this.patch(res.data);
        this.toast.success(res?.message || 'Saved.');
        // After the request has finished (busy cleared), so a follow-up request can take over the busy flag.
        if (after) queueMicrotask(() => after(res));
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
