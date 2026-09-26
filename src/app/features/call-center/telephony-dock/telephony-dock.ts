import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { CallTimerService } from '../../../core/telephony/call-timer.service';
import {
  AGENT_STATUS_LABELS,
  AgentStatus,
  CallLog,
  CallerProfile,
  LIVE_CALL_STATUSES,
  SELECTABLE_AGENT_STATUSES,
  TelecallerRow,
} from '../../../core/telephony/telephony.models';
import { TelephonyService } from '../../../core/telephony/telephony.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { ActiveCallComponent } from '../active-call/active-call.component';
import { openCallOutcome } from '../call-disposition/open-call-outcome';
import { IncomingCallComponent } from '../incoming-call/incoming-call.component';

/**
 * Floating call widget mounted once in the app layout. Owns the telephony wiring - caller
 * lookup, ringtone, outcome dialog and presence - and delegates the visuals to
 * <app-incoming-call> and <app-active-call>.
 */
@Component({
  selector: 'app-telephony-dock',
  standalone: true,
  imports: [CommonModule, MatDialogModule, IncomingCallComponent, ActiveCallComponent],
  templateUrl: './telephony-dock.html',
  styleUrl: './telephony-dock.scss',
})
export class TelephonyDock implements OnDestroy {
  readonly telephony = inject(TelephonyService);
  private readonly timer = inject(CallTimerService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = SELECTABLE_AGENT_STATUSES;
  readonly statusLabels = AGENT_STATUS_LABELS;

  readonly busy = signal(false);
  readonly statusMenuOpen = signal(false);
  readonly callerProfile = signal<CallerProfile | null>(null);
  readonly transferTargets = signal<TelecallerRow[]>([]);

  /** Lets the floating dock be dragged to a different spot on screen. Purely a visual offset -
   *  it never affects the presence/call logic below. */
  readonly dockPos = signal<{ x: number; y: number } | null>(null);
  private dragOrigin: { x: number; y: number; posX: number; posY: number } | null = null;
  private dragged = false;

  readonly ringing = this.telephony.ringingCall;
  readonly active = this.telephony.activeCall;

  readonly callSeconds = computed(() => {
    const call = this.active();
    return this.timer.elapsedSeconds(call?.connected_at ?? call?.answered_at);
  });

  readonly ringSecondsLeft = computed(() =>
    this.timer.remainingSeconds(this.ringing()?.ringing_at, this.telephony.state()?.ring_timeout ?? 30)
  );

  private profileForCallId: number | null = null;
  private outcomeOpenFor: number | null = null;
  private ringtone?: { timer: ReturnType<typeof setInterval> };
  /** Reused across every ring instead of recreated each time, so it only ever needs
   *  unlocking once (see unlockAudio()) rather than hitting the autoplay block on every call. */
  private audioCtx?: AudioContext;
  private readonly unlockAudioEvents = ['pointerdown', 'keydown'] as const;
  private readonly unlockAudio = (): void => {
    this.audioCtx ??= new AudioContext();
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => undefined);
  };

  constructor() {
    // The ringtone fires from a poll response, not a click, so Chrome's autoplay policy
    // blocks a fresh AudioContext from actually making sound ("was not allowed to start").
    // Unlock one on the first real user gesture and reuse it for every ring afterwards.
    this.unlockAudioEvents.forEach(evt => document.addEventListener(evt, this.unlockAudio, { passive: true }));
    this.destroyRef.onDestroy(() =>
      this.unlockAudioEvents.forEach(evt => document.removeEventListener(evt, this.unlockAudio))
    );

    // Load the caller card once per ringing / active call.
    effect(() => {
      const call = this.ringing() ?? this.active();
      if (!call) {
        this.profileForCallId = null;
        this.callerProfile.set(null);
        return;
      }
      if (call.id === this.profileForCallId) return;
      this.profileForCallId = call.id;
      untracked(() => this.telephony.getCall(call.id).subscribe({
        next: ({ caller }) => this.callerProfile.set(caller),
        error: () => this.callerProfile.set(null),
      }));
    });

    // Ringtone while an inbound call is ringing.
    effect(() => {
      const ringing = !!this.ringing();
      untracked(() => (ringing ? this.startRingtone() : this.stopRingtone()));
    });

    // Outcome is mandatory for an answered call (also after a page reload).
    effect(() => {
      const pending = this.telephony.pendingDisposition();
      if (pending && !this.telephony.onCall()) untracked(() => this.openOutcome(pending, true));
    });

    this.telephony.callFinished$.pipe(takeUntilDestroyed()).subscribe(call => this.onCallFinished(call));
  }

  ngOnDestroy(): void {
    this.stopRingtone();
    this.audioCtx?.close().catch(() => undefined);
  }

  get showDock(): boolean {
    return this.telephony.isTelecaller() || !!this.ringing() || !!this.active();
  }

  statusClass(status: AgentStatus): string {
    return `status-${status.replace('_', '-')}`;
  }

  /* ---------------- presence ---------------- */

  toggleStatusMenu(): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    if (this.telephony.onCall()) return;
    this.statusMenuOpen.update(open => !open);
  }

  onDockPointerDown(event: PointerEvent): void {
    const origin = this.dockPos() ?? { x: 0, y: 0 };
    this.dragOrigin = { x: event.clientX, y: event.clientY, posX: origin.x, posY: origin.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onDockPointerMove(event: PointerEvent): void {
    if (!this.dragOrigin) return;
    const dx = event.clientX - this.dragOrigin.x;
    const dy = event.clientY - this.dragOrigin.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.dragged = true;
    if (this.dragged) {
      this.dockPos.set({ x: this.dragOrigin.posX + dx, y: this.dragOrigin.posY + dy });
    }
  }

  onDockPointerUp(): void {
    this.dragOrigin = null;
  }

  setStatus(status: AgentStatus): void {
    this.statusMenuOpen.set(false);
    this.telephony.setStatus(status).subscribe({ error: err => this.fail(err, 'Could not change your status.') });
  }

  /* ---------------- call controls ---------------- */

  answer(call: CallLog): void {
    this.run(this.telephony.answer(call.id), 'Could not answer the call.');
  }

  reject(call: CallLog): void {
    this.run(this.telephony.reject(call.id), 'Could not reject the call.');
  }

  hangup(call: CallLog): void {
    this.run(this.telephony.hangup(call.id), 'Could not end the call.');
  }

  toggleHold(call: CallLog): void {
    const request = call.status === 'hold' ? this.telephony.resume(call.id) : this.telephony.hold(call.id);
    this.run(request, 'Could not change hold.');
  }

  loadTransferTargets(): void {
    const me = this.auth.currentUser()?.id;
    this.telephony.telecallers().subscribe({
      next: rows => this.transferTargets.set(rows.filter(r => r.status === 'available' && r.id !== me)),
      error: () => this.transferTargets.set([]),
    });
  }

  transfer(call: CallLog, target: TelecallerRow): void {
    this.run(this.telephony.transfer(call.id, target.id), 'Could not transfer the call.');
  }

  saveNote(call: CallLog, note: string): void {
    this.telephony.addNote(call.id, note).subscribe({
      error: err => this.fail(err, 'Could not save the note.'),
    });
  }

  /* ---------------- outcome ---------------- */

  private onCallFinished(call: CallLog): void {
    const me = this.auth.currentUser()?.id;
    this.telephony.getCall(call.id).subscribe(({ call: fresh }) => {
      const mine = fresh.employee_id === me;
      const finished = !LIVE_CALL_STATUSES.includes(fresh.status);
      // Rejected / re-routed inbound calls need no outcome; unanswered outbound ones may log e.g. "no answer".
      if (mine && finished && !fresh.disposed_at && (fresh.answered_at || fresh.direction === 'outbound')) {
        this.openOutcome(fresh, !!fresh.answered_at);
      }
    });
  }

  private openOutcome(call: CallLog, required: boolean): void {
    if (this.outcomeOpenFor === call.id) return;
    this.outcomeOpenFor = call.id;

    openCallOutcome(this.dialog, call, required)
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.outcomeOpenFor = null;
        this.telephony.refresh();
      });
  }

  /* ---------------- helpers ---------------- */

  private run(request: ReturnType<TelephonyService['answer']>, fallback: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    request.subscribe({
      next: () => this.busy.set(false),
      error: err => {
        this.busy.set(false);
        this.fail(err, fallback);
      },
    });
  }

  private fail(err: any, fallback: string): void {
    this.toast.error(err?.error?.message || fallback);
    this.telephony.refresh();
  }

  /** Soft two-tone ring via WebAudio (no asset needed). Reuses the context unlockAudio()
   *  set up on the page's first click/keydown, instead of creating a fresh (autoplay-blocked) one.
   *  If nothing has unlocked audio yet (e.g. a call rings before the telecaller has clicked
   *  anywhere on the page this session), it stays silent - the popup is still shown - rather
   *  than repeatedly calling start() on a suspended context and spamming the console. */
  private startRingtone(): void {
    if (this.ringtone) return;
    try {
      // Only reuse a context a real gesture already created - don't create one from here,
      // since this effect fires from a poll response, not a click.
      const ctx = this.audioCtx;

      const beep = () => {
        if (!ctx || ctx.state !== 'running') return;
        [0, 0.25].forEach(offset => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.08, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.2);
        });
      };
      beep();
      this.ringtone = { timer: setInterval(beep, 2000) };
    } catch {
      // Audio unavailable - the visual popup is enough.
    }
  }

  private stopRingtone(): void {
    if (!this.ringtone) return;
    clearInterval(this.ringtone.timer);
    this.ringtone = undefined;
  }
}
