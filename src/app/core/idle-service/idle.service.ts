import { Injectable, signal } from '@angular/core';

const IDLE_MINUTES_KEY = 'idle_timeout_minutes';
const DEFAULT_IDLE_MINUTES = 15;
const MIN_IDLE_MINUTES = 1;
const MAX_IDLE_MINUTES = 180;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'] as const;

@Injectable({
  providedIn: 'root',
})
export class IdleService {
  readonly idleMinutes = signal<number>(this.readIdleMinutes());

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private listenersBound = false;
  private onTimeout: (() => void) | null = null;

  setIdleMinutes(minutes: number): void {
    const safeMinutes = Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.floor(minutes)));
    this.idleMinutes.set(safeMinutes);
    localStorage.setItem(IDLE_MINUTES_KEY, String(safeMinutes));

    if (this.listenersBound) {
      this.resetTimer();
    }
  }

  start(onTimeout: () => void): void {
    this.onTimeout = onTimeout;

    if (!this.listenersBound) {
      ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, this.handleActivity, { passive: true }));
      this.listenersBound = true;
    }

    this.resetTimer();
  }

  stop(): void {
    if (this.listenersBound) {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, this.handleActivity));
      this.listenersBound = false;
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.onTimeout = null;
  }

  private handleActivity = (): void => {
    this.resetTimer();
  };

  private resetTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => this.onTimeout?.(), this.idleMinutes() * 60 * 1000);
  }

  private readIdleMinutes(): number {
    const stored = Number(localStorage.getItem(IDLE_MINUTES_KEY));
    return stored >= MIN_IDLE_MINUTES ? stored : DEFAULT_IDLE_MINUTES;
  }
}
