import { Injectable, Injector, effect, inject, untracked } from '@angular/core';
import { NotificationService } from './notification.service';

const BLINK_MS = 1000;
const BADGE_COLOR = '#e0392f';
/** Taskbar flash helper on the staff PC (tools/taskbar-flash-helper); must match its $Port. */
const FLASH_HELPER_URL = 'http://localhost:47321';

/**
 * Draws attention to unread bell notifications outside the page:
 * - tab title "Renew Groups (3)" and a red count badge on the favicon;
 * - while the tab / window is in the background, the title blinks ("🔔 3 new notifications") until it is looked at;
 * - a new notification also raises a desktop (OS) notification when the tab is in the background (permission is asked
 *   on the first click anywhere, as browsers only allow that after a user gesture);
 * - installed app (PWA): the count is set as the taskbar / dock app badge.
 *
 * - Chrome's taskbar button flashes through the Windows helper (tools/taskbar-flash-helper) when it is installed on the PC;
 *   a web page cannot flash the taskbar itself, and no browser alert box is used.
 */
@Injectable({ providedIn: 'root' })
export class TabAttentionService {
  private readonly notifications = inject(NotificationService);
  private readonly injector = inject(Injector);
  private baseTitle = 'Renew Groups';
  private baseIcon = '';
  private iconImage: HTMLImageElement | null = null;
  private blinkTimer: ReturnType<typeof setInterval> | null = null;
  private blinkOn = false;
  private started = false;
  /** Notification ids already known, so only newly arrived ones raise a desktop notification. */
  private known = new Set<string>();
  private firstSync = true;
  private lastIconCount = -1;

  start(): void {
    if (this.started) return;
    this.started = true;
    // strip a count left from before, at either end: "(3) Renew Groups" or "Renew Groups (3)"
    this.baseTitle = document.title.replace(/^\(\d+\+?\)\s*|\s*\(\d+\+?\)$/g, '') || 'Renew Groups';
    const link = this.iconLink();
    this.baseIcon = link?.href ?? '';
    if (this.baseIcon) {
      const img = new Image();
      img.onload = () => { this.iconImage = img; this.lastIconCount = -1; this.apply(); };
      img.src = this.baseIcon;
    }

    document.addEventListener('visibilitychange', () => this.apply());
    window.addEventListener('focus', () => this.apply());
    window.addEventListener('blur', () => this.apply());
    // desktop notifications need permission, and browsers only let a page ask after a user gesture
    const ask = () => {
      document.removeEventListener('click', ask, true);
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
      this.askLocalNetworkAccess();
    };
    document.addEventListener('click', ask, true);

    effect(() => {
      const list = this.notifications.notifications();
      untracked(() => {
        this.notifyNew(list.filter(n => !n.read));
        this.apply();
      });
    }, { injector: this.injector });
  }

  private unread(): number {
    return this.notifications.unreadCount();
  }

  /** True while the person is not looking at the page (other tab, minimised or another app focused). */
  private away(): boolean {
    return document.visibilityState === 'hidden' || !document.hasFocus();
  }

  /** Title of an alert card raised while the person was away; blinks in the tab until they come back. */
  private alertTitle: string | null = null;

  /**
   * An alert card (AlertStackService) popped up: while the page is in the background, blink the tab title with it and raise a
   * desktop notification, and flash Chrome's taskbar button through the helper (no alert box).
   */
  attention(title: string, body?: string): void {
    if (!this.started || !this.away()) return;
    this.alertTitle = title;
    this.desktopNotify(title, body ?? '');
    this.flashTaskbar();
    this.apply();
  }

  private apply(): void {
    const n = this.unread();
    this.setIcon(n);
    this.setAppBadge(n);
    if (!this.away()) this.alertTitle = null; // seen
    if ((n > 0 || this.alertTitle) && this.away()) this.startBlink();
    else {
      this.stopBlink();
      document.title = n > 0 ? `${this.baseTitle} (${this.label(n)})` : this.baseTitle;
    }
  }

  private flashBusy = false;

  /**
   * Chrome (142+) only lets a site on a public address (the live domain) call this PC's localhost helper after the
   * person allows "Local network access" for that site. The prompt can only show while the page is in front, but the
   * flash call is made while it is in the background - so it would wait for an answer nobody can give and be dropped.
   * Calling /health once on the first click, while the person is on the page, lets Chrome ask; after "Allow" the
   * background flash calls go through. The LAN / localhost addresses mostly do not need this, which is why the flash
   * worked there but not on the live site.
   */
  private askLocalNetworkAccess(): void {
    const ctrl = new AbortController();
    // long enough for the person to answer Chrome's prompt
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    fetch(`${FLASH_HELPER_URL}/health`, { signal: ctrl.signal, cache: 'no-store' })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
  }

  /**
   * Flashes Chrome's pinned taskbar button (orange, until Chrome is clicked) through the Windows helper
   * (tools/taskbar-flash-helper) running on this PC. No helper running = the request fails quietly and nothing flashes;
   * no browser alert box is used.
   */
  private flashTaskbar(): void {
    if (this.flashBusy) return;
    this.flashBusy = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    fetch(`${FLASH_HELPER_URL}/flash`, { method: 'POST', signal: ctrl.signal, cache: 'no-store' })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        this.flashBusy = false;
      });
  }

  private label(n: number): string {
    return n > 99 ? '99+' : String(n);
  }

  private startBlink(): void {
    const tick = () => {
      const n = this.unread();
      if ((!n && !this.alertTitle) || !this.away()) return this.apply();
      this.blinkOn = !this.blinkOn;
      const loud = this.alertTitle ? `🔔 ${this.alertTitle}` : `🔔 ${this.label(n)} new notification${n === 1 ? '' : 's'}`;
      document.title = this.blinkOn ? loud : n > 0 ? `${this.baseTitle} (${this.label(n)})` : this.baseTitle;
    };
    if (!this.blinkTimer) {
      tick();
      this.blinkTimer = setInterval(tick, BLINK_MS);
    }
  }

  private stopBlink(): void {
    if (this.blinkTimer) clearInterval(this.blinkTimer);
    this.blinkTimer = null;
    this.blinkOn = false;
  }

  /** Desktop notification for notifications that arrived since the last sync (not for the ones already there on load). */
  private notifyNew(unread: { id: string; title: string; message: string }[]): void {
    const fresh = unread.filter(n => !this.known.has(n.id));
    unread.forEach(n => this.known.add(n.id));
    if (this.firstSync) {
      this.firstSync = false;
      return;
    }
    if (!fresh.length || !this.away()) return;
    const one = fresh.length === 1 ? fresh[0] : null;
    const title = one ? one.title : `${fresh.length} new notifications`;
    const body = one ? one.message : fresh.slice(0, 3).map(n => n.title).join('\n');
    this.desktopNotify(title, body);
    this.flashTaskbar();
  }

  /** OS notification (Windows toast); needs the permission asked on the first click. */
  private desktopNotify(title: string, body: string): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const note = new Notification(title, {
        body,
        icon: this.baseIcon || undefined,
        tag: 'renew-erp-bell',
        renotify: true,
      } as NotificationOptions);
      note.onclick = () => { window.focus(); note.close(); };
    } catch { /* some browsers only allow notifications from a service worker */ }
  }

  /** The favicon with a red count badge (the plain logo when nothing is unread). */
  private setIcon(n: number): void {
    const link = this.iconLink();
    if (!link || !this.baseIcon || n === this.lastIconCount) return;
    this.lastIconCount = n;
    if (!n || !this.iconImage) {
      link.href = this.baseIcon;
      return;
    }
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(this.iconImage, 0, 0, size, size);
      const text = n > 9 ? '9+' : String(n);
      const r = 19;
      const cx = size - r;
      const cy = r;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = BADGE_COLOR;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${text.length > 1 ? 22 : 28}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy + 1);
      link.href = canvas.toDataURL('image/png');
    } catch {
      link.href = this.baseIcon; // canvas blocked (cross-origin icon)
    }
  }

  /** Taskbar / dock badge of the installed app (PWA); ignored in a normal tab. */
  private setAppBadge(n: number): void {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (n > 0) void nav.setAppBadge?.(n)?.catch(() => undefined);
      else void nav.clearAppBadge?.()?.catch(() => undefined);
    } catch { /* not supported */ }
  }

  private iconLink(): HTMLLinkElement | null {
    return document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  }
}
