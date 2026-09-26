import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, Subject, Subscription, catchError, exhaustMap, map, of, tap, timer } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ApiDataService } from '../http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import {
  AgentState,
  AgentStatus,
  CallAlert,
  CallAlertStatus,
  CallDisposition,
  CallLog,
  CallerProfile,
  DispositionPayload,
  TelecallerRow,
  TelephonyConnectionState,
} from './telephony.models';

/** How often the browser polls the agent state. Also acts as the presence heartbeat. */
const POLL_MS = 3000;

/** How often the browser polls the missed-call alert feed. */
const ALERT_POLL_MS = 15000;

/** Maps a raw `telephony/alerts` row (snake_case) to the camelCase shape the UI works with. */
function toCallAlert(raw: any): CallAlert {
  return {
    id: String(raw.id),
    callId: raw.call_id ?? raw.callId,
    telecallerName: raw.telecaller_name ?? raw.telecaller?.name ?? '',
    branchName: raw.branch_name ?? raw.branch?.name ?? '',
    customerNumber: raw.customer_number ?? raw.caller_number ?? raw.destination_number ?? '',
    status: (raw.status ?? 'no_answer') as CallAlertStatus,
    occurredAt: raw.occurred_at ?? raw.created_at ?? new Date().toISOString(),
    acknowledged: !!(raw.acknowledged ?? raw.acknowledged_at),
  };
}

/**
 * Telecaller call state shared by the dock (incoming popup / live call bar), Lead
 * Management's call buttons and the CRM page. Polls GET /telephony/agents/me while
 * logged in; swap the poll for a Laravel Echo subscription once Reverb is enabled.
 */
@Injectable({ providedIn: 'root' })
export class TelephonyService {
  private readonly api = inject(ApiDataService);
  private readonly auth = inject(AuthService);

  readonly state = signal<AgentState | null>(null);
  readonly ringingCall = computed(() => this.state()?.ringing_call ?? null);
  readonly activeCall = computed(() => this.state()?.active_call ?? null);
  readonly pendingDisposition = computed(() => this.state()?.pending_disposition ?? null);
  readonly agentStatus = computed<AgentStatus>(() => this.state()?.agent?.status ?? 'offline');
  readonly isTelecaller = computed(() => !!this.state()?.is_telecaller);
  readonly isSupervisor = computed(() => !!this.state()?.is_supervisor);
  readonly onCall = computed(() => !!this.activeCall() || !!this.ringingCall());

  /** Calls a telecaller didn't handle (missed / rejected / disconnected), for the Missed Calls page. */
  readonly alerts = signal<CallAlert[]>([]);
  readonly connectionState = signal<TelephonyConnectionState>('idle');

  /** Emits a call of mine that just left the live state, so the dock can ask for its outcome. */
  readonly callFinished$ = new Subject<CallLog>();

  /** Emits after an outcome is saved (lead status / follow-up changed), so lists can reload. */
  readonly outcomeSaved$ = new Subject<CallLog>();

  private poll?: Subscription;
  private alertPoll?: Subscription;
  private lastLiveCall: CallLog | null = null;
  private dispositionCache?: CallDisposition[];

  /** The simulator has no PBX-side call recording, so we capture the telecaller's own mic
   *  locally while a call is connected and upload it as that call's recording on hangup. */
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingCallId: number | null = null;
  private recordingStartedAt = 0;

  constructor() {
    effect(() => (this.auth.isAuthenticated() ? this.startPolling() : this.stopPolling()));
    effect(() => this.syncRecording(this.activeCall()));
  }

  refresh(): void {
    this.fetchState().subscribe();
  }

  /* ---------------- calls ---------------- */

  dial(target: { lead_id?: number; phone_number?: string }): Observable<CallLog> {
    return this.post(ApiRoutesConstants.CALL_OUTBOUND, target);
  }

  answer(callId: number): Observable<CallLog> { return this.control(callId, 'answer'); }
  reject(callId: number): Observable<CallLog> { return this.control(callId, 'reject'); }
  hangup(callId: number): Observable<CallLog> { return this.control(callId, 'hangup'); }
  hold(callId: number): Observable<CallLog> { return this.control(callId, 'hold'); }
  resume(callId: number): Observable<CallLog> { return this.control(callId, 'resume'); }

  transfer(callId: number, targetUserId: number): Observable<CallLog> {
    return this.control(callId, 'transfer', { target_user_id: targetUserId });
  }

  /** Call + caller card (lead, previous calls, next follow-up). */
  getCall(callId: number): Observable<{ call: CallLog; caller: CallerProfile }> {
    return this.api.GET(`${ApiRoutesConstants.CALL_LIST}/${callId}`).pipe(
      map((res: any) => ({ call: res.data as CallLog, caller: res.caller as CallerProfile }))
    );
  }

  addNote(callId: number, note: string): Observable<unknown> {
    return this.api.POST(`${ApiRoutesConstants.CALL_LIST}/${callId}/notes`, { note });
  }

  saveDisposition(callId: number, payload: DispositionPayload): Observable<CallLog> {
    return this.post(`${ApiRoutesConstants.CALL_LIST}/${callId}/disposition`, payload).pipe(
      tap(call => this.outcomeSaved$.next(call))
    );
  }

  dispositions(): Observable<CallDisposition[]> {
    if (this.dispositionCache) return of(this.dispositionCache);
    return this.api.GET(ApiRoutesConstants.CALL_DISPOSITIONS).pipe(
      map((res: any) => (res?.data ?? []) as CallDisposition[]),
      tap((list: CallDisposition[]) => (this.dispositionCache = list))
    );
  }

  /* ---------------- agents ---------------- */

  setStatus(status: AgentStatus): Observable<unknown> {
    return this.api.POST(ApiRoutesConstants.CALL_AGENT_STATUS, { status }).pipe(tap(() => this.refresh()));
  }

  telecallers(): Observable<TelecallerRow[]> {
    return this.api.GET(ApiRoutesConstants.CALL_AGENT_LIST).pipe(map((res: any) => (res?.data ?? []) as TelecallerRow[]));
  }

  assignLeads(leadIds: number[], assignedTo: number | null): Observable<any> {
    return this.api.POST(ApiRoutesConstants.LEAD_ASSIGN, { lead_ids: leadIds, assigned_to: assignedTo });
  }

  /* ---------------- alerts ---------------- */

  /** Marks an alert reviewed. Updates local state right away; the request runs in the background. */
  acknowledgeAlert(alertId: string): void {
    this.alerts.update((list) => list.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
    this.api.POST(`${ApiRoutesConstants.CALL_ALERT_LIST}/${alertId}/acknowledge`, {}).subscribe();
  }

  /* ---------------- internals ---------------- */

  private control(callId: number, action: string, body: object = {}): Observable<CallLog> {
    return this.post(`${ApiRoutesConstants.CALL_LIST}/${callId}/${action}`, body);
  }

  /** POST, unwrap `data`, then refresh the agent state so the UI reflects the change at once. */
  private post(path: string, body: object): Observable<CallLog> {
    return this.api.POST(path, body).pipe(
      map((res: any) => res.data as CallLog),
      tap(() => this.refresh())
    );
  }

  private startPolling(): void {
    if (this.poll) return;
    this.poll = timer(0, POLL_MS).pipe(exhaustMap(() => this.fetchState())).subscribe();

    this.connectionState.set('connecting');
    this.alertPoll = timer(0, ALERT_POLL_MS).pipe(exhaustMap(() => this.fetchAlerts())).subscribe();
  }

  private stopPolling(): void {
    this.poll?.unsubscribe();
    this.poll = undefined;
    this.state.set(null);
    this.lastLiveCall = null;

    this.alertPoll?.unsubscribe();
    this.alertPoll = undefined;
    this.alerts.set([]);
    this.connectionState.set('idle');
  }

  private fetchState(): Observable<AgentState | null> {
    return this.api.GET(ApiRoutesConstants.CALL_AGENT_ME).pipe(
      map((res: any) => (res?.success ? (res.data as AgentState) : null)),
      tap((state: AgentState | null) => state && this.applyState(state)),
      catchError(() => of(null))
    );
  }

  private fetchAlerts(): Observable<CallAlert[]> {
    return this.api.GET(ApiRoutesConstants.CALL_ALERT_LIST).pipe(
      map((res: any) => ((res?.data ?? []) as any[]).map(toCallAlert)),
      tap((alerts: CallAlert[]) => {
        this.alerts.set(alerts);
        this.connectionState.set('polling');
      }),
      catchError(() => {
        this.connectionState.set('offline');
        return of(this.alerts());
      })
    );
  }

  private applyState(state: AgentState): void {
    const live = state.active_call ?? state.ringing_call;
    if (this.lastLiveCall && this.lastLiveCall.id !== live?.id) {
      this.callFinished$.next(this.lastLiveCall);
    }
    this.lastLiveCall = live;
    this.state.set(state);
  }

  /* ---------------- microphone recording ---------------- */

  private syncRecording(call: CallLog | null): void {
    if (call?.status === 'connected' && this.recordingCallId !== call.id) {
      this.startRecording(call.id);
    } else if (this.recordingCallId !== null && (!call || call.id !== this.recordingCallId)) {
      this.stopRecording();
    }
  }

  private startRecording(callId: number): void {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      // The call may already have moved on by the time the mic permission prompt resolves.
      const call = this.activeCall();
      if (call?.id !== callId || call.status !== 'connected') {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      this.recordedChunks = [];
      this.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      this.recordingCallId = callId;
      this.recordingStartedAt = Date.now();

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) this.recordedChunks.push(event.data);
      };
      this.mediaRecorder.onstop = () => stream.getTracks().forEach(track => track.stop());

      this.mediaRecorder.start();
    }).catch(() => undefined); // Mic denied/unavailable: the call just won't have a recording.
  }

  private stopRecording(): void {
    const callId = this.recordingCallId;
    const recorder = this.mediaRecorder;
    const durationSeconds = Math.max(0, Math.round((Date.now() - this.recordingStartedAt) / 1000));

    this.recordingCallId = null;
    this.mediaRecorder = null;
    if (!recorder || callId === null) return;

    recorder.addEventListener('stop', () => {
      const blob = new Blob(this.recordedChunks, { type: recorder.mimeType || 'audio/webm' });
      this.recordedChunks = [];
      if (blob.size > 0) this.uploadRecording(callId, blob, durationSeconds);
    }, { once: true });

    if (recorder.state !== 'inactive') recorder.stop();
  }

  private uploadRecording(callId: number, blob: Blob, durationSeconds: number): void {
    const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
    const form = new FormData();
    form.append('recording', blob, `call-${callId}.${extension}`);
    form.append('duration', String(durationSeconds));

    this.api.POST(`${ApiRoutesConstants.CALL_LIST}/${callId}/recording`, form).subscribe({ error: () => undefined });
  }
}
