import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, interval } from 'rxjs';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppContextService } from '../whatsapp-context.service';
import { WaMessage } from '../whatsapp.models';

/**
 * Settings -> WhatsApp Business -> Message History: every message in and out of the numbers the user may see, newest
 * first, with Meta's delivery state. Refreshes itself every 15 seconds so incoming messages appear without a reload.
 */
@Component({
  selector: 'app-wa-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-history.html',
  styleUrl: './wa-history.scss',
})
export class WaHistory implements OnDestroy {
  private readonly api = inject(WhatsAppApiService);
  readonly ctx = inject(WhatsAppContextService);

  readonly rows = signal<WaMessage[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal(0);
  readonly direction = signal<'' | 'inbound' | 'outbound'>('');
  readonly status = signal('');
  readonly search = signal('');
  readonly selected = signal<WaMessage | null>(null);
  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();

  constructor() {
    this.ctx.load();
    effect(() => {
      this.ctx.accountId(); this.ctx.phoneNumberId(); this.direction(); this.status(); this.search(); this.page();
      untracked(() => this.load());
    });
    this.subs.add(this.search$.pipe(debounceTime(300)).subscribe(v => { this.search.set(v); this.page.set(1); }));
    // new messages arrive by webhook: refresh the first page quietly
    this.subs.add(interval(15000).subscribe(() => { if (this.page() === 1) this.load(true); }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  onSearch(v: string): void {
    this.search$.next(v);
  }

  setFilter(kind: 'direction' | 'status', v: string): void {
    (this[kind] as any).set(v);
    this.page.set(1);
  }

  load(quiet = false): void {
    if (!quiet) this.loading.set(true);
    this.api.messages({
      account_id: this.ctx.accountId(), phone_number_id: this.ctx.phoneNumberId(), direction: this.direction(), status: this.status(),
      search: this.search(), page: this.page(), per_page: 30,
    }).subscribe({
      next: p => {
        this.rows.set(p?.data ?? []);
        this.lastPage.set(p?.last_page ?? 1);
        this.total.set(p?.total ?? 0);
        this.loading.set(false);
        this.error.set(null);
      },
      error: err => {
        this.loading.set(false);
        if (!quiet) this.error.set(err?.error?.message || 'Could not load messages.');
      },
    });
  }

  icon(m: WaMessage): string {
    switch (m.type) {
      case 'image': return 'bi-image';
      case 'video': return 'bi-camera-video';
      case 'audio': return 'bi-mic';
      case 'document': return 'bi-file-earmark';
      case 'location': return 'bi-geo-alt';
      case 'contacts': return 'bi-person-vcard';
      case 'button': case 'interactive': return 'bi-hand-index';
      case 'template': return 'bi-file-earmark-richtext';
      case 'reaction': return 'bi-emoji-smile';
      default: return 'bi-chat-left-text';
    }
  }

  tone(s: string): string {
    return s === 'read' ? 'blue' : ['delivered', 'sent', 'accepted', 'received'].includes(s) ? 'green' : s === 'failed' ? 'red' : '';
  }

  text(m: WaMessage): string {
    if (m.type === 'button' || m.type === 'interactive') return `Clicked: ${m.button_text ?? m.body ?? ''}`;
    if (m.type === 'reaction') return `Reacted ${m.body ?? ''}`;
    if (m.type === 'location') return m.body || 'Location shared';
    if (m.type === 'unsupported') return 'Message type not supported by the Cloud API';
    return m.body || (m.media?.filename ?? m.type);
  }
}
