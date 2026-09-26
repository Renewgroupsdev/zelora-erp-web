import { Injectable, signal } from '@angular/core';

/**
 * One app-wide one-second tick, shared by the incoming-call ring countdown and the
 * active-call duration timer so each call component doesn't run its own interval.
 */
@Injectable({ providedIn: 'root' })
export class CallTimerService {
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1000);
  }

  /** Seconds elapsed since an ISO timestamp. Reactive - re-reads on every tick. */
  elapsedSeconds(since: string | null | undefined): number {
    if (!since) return 0;
    return Math.max(0, (this.now() - new Date(since).getTime()) / 1000);
  }

  /** Seconds left of `total`, counted from an ISO timestamp. Reactive. */
  remainingSeconds(since: string | null | undefined, total: number): number {
    if (!since) return total;
    return Math.max(0, Math.ceil(total - (this.now() - new Date(since).getTime()) / 1000));
  }
}
