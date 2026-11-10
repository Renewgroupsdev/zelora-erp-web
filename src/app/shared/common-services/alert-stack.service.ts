import { Injectable } from '@angular/core';

export type AlertStackTone = 'warning' | 'info' | 'success' | 'danger';

export interface AlertStackItem {
  title: string;
  text?: string;
  /** Small pills under the text, e.g. ['5 leads', '2 due today']. */
  chips?: string[];
  tone?: AlertStackTone;
  /** Bootstrap-icons class, e.g. 'bi-person-x-fill'. */
  icon?: string;
  /** Auto-close after this many ms (default 8000). 0 = stays until closed. */
  duration?: number;
  /** Optional action button (e.g. "Reassign"). Clicking it closes the card and runs the handler. */
  actionLabel?: string;
  onAction?: () => void;
}

const MAX_VISIBLE = 4;
const STAGGER_MS = 550;
const EXIT_MS = 380;

const TONE_ICON: Record<AlertStackTone, string> = {
  warning: 'bi-exclamation-lg',
  info: 'bi-info-lg',
  success: 'bi-check-lg',
  danger: 'bi-x-lg',
};

/**
 * Stacked, animated alert cards (top-right). Several alerts raised together appear ONE BY ONE, each sliding in below the
 * previous one; a card that closes collapses and the rest glide up. Hover pauses the countdown. Plain DOM (like SweetAlert)
 * so any service can call it, with the styles in styles.scss (".as-*").
 */
@Injectable({ providedIn: 'root' })
export class AlertStackService {
  private host: HTMLElement | null = null;
  private readonly queue: AlertStackItem[] = [];
  private visible = 0;
  private draining = false;

  /** Queue one or more alerts; they enter one after another. */
  show(...items: AlertStackItem[]): void {
    this.queue.push(...items);
    void this.drain();
  }

  /** Close every card and forget the waiting ones. */
  clear(): void {
    this.queue.length = 0;
    this.host?.querySelectorAll<HTMLElement>('.as-card').forEach(c => c.dispatchEvent(new Event('as-close')));
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.length) {
      if (this.visible >= MAX_VISIBLE) { await this.sleep(300); continue; } // wait for room instead of piling up
      this.render(this.queue.shift()!);
      if (this.queue.length) await this.sleep(STAGGER_MS);
    }
    this.draining = false;
  }

  private render(item: AlertStackItem): void {
    const tone = item.tone ?? 'warning';
    const duration = item.duration ?? 8000;
    const host = this.ensureHost();

    const card = document.createElement('div');
    card.className = `as-card as-${tone}`;
    card.setAttribute('role', tone === 'danger' || tone === 'warning' ? 'alert' : 'status');
    card.style.setProperty('--as-duration', `${duration}ms`);
    card.innerHTML = `
      <span class="as-badge"><span class="as-ring"></span><span class="as-ring as-ring-2"></span><i class="bi ${this.esc(item.icon ?? TONE_ICON[tone])}"></i></span>
      <div class="as-body">
        <div class="as-title">${this.esc(item.title)}</div>
        ${item.text ? `<div class="as-text">${this.esc(item.text)}</div>` : ''}
        ${item.chips?.length ? `<div class="as-chips">${item.chips.map((c, i) => `<span class="as-chip" style="animation-delay:${0.35 + i * 0.1}s">${this.esc(c)}</span>`).join('')}</div>` : ''}
        ${item.actionLabel ? `<button type="button" class="as-action">${this.esc(item.actionLabel)} <i class="bi bi-arrow-right"></i></button>` : ''}
      </div>
      <button type="button" class="as-close" aria-label="Dismiss"><i class="bi bi-x-lg"></i></button>
      ${duration > 0 ? '<span class="as-progress"></span>' : ''}`;

    this.visible++;
    host.appendChild(card);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let left = duration;
    let startedAt = 0;
    let closed = false;
    const arm = () => {
      if (duration <= 0) return;
      startedAt = Date.now();
      timer = setTimeout(close, left);
    };
    const close = () => {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      // freeze the height so the card can collapse smoothly and the cards below glide up
      card.style.maxHeight = `${card.offsetHeight}px`;
      void card.offsetHeight;
      card.classList.add('as-leaving');
      card.style.maxHeight = '0px';
      setTimeout(() => { card.remove(); this.visible--; }, EXIT_MS);
    };

    card.addEventListener('mouseenter', () => {
      if (closed || duration <= 0) return;
      if (timer) clearTimeout(timer);
      left -= Date.now() - startedAt;
      card.classList.add('as-paused');
    });
    card.addEventListener('mouseleave', () => {
      if (closed || duration <= 0) return;
      card.classList.remove('as-paused');
      arm();
    });
    card.addEventListener('as-close', close);
    card.querySelector('.as-close')!.addEventListener('click', e => { e.stopPropagation(); close(); });
    card.querySelector('.as-action')?.addEventListener('click', e => {
      e.stopPropagation();
      close();
      item.onAction?.();
    });
    arm();
  }

  private ensureHost(): HTMLElement {
    if (this.host && document.body.contains(this.host)) return this.host;
    this.host = document.createElement('div');
    this.host.className = 'as-host';
    this.host.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.host);
    return this.host;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private esc(v: unknown): string {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
}
