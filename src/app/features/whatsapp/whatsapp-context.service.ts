import { Injectable, computed, inject, signal } from '@angular/core';
import { WhatsAppApiService } from './whatsapp-api.service';
import { WaSwitcherAccount } from './whatsapp.models';

const STORAGE_KEY = 'wa_context';

/**
 * Which connected account / business number the user is working with on the WhatsApp pages (header switcher).
 * The list comes from the API, already limited to what this user may see; the choice is remembered per browser.
 * null = "All accounts" / "All numbers".
 */
@Injectable({ providedIn: 'root' })
export class WhatsAppContextService {
  private readonly api = inject(WhatsAppApiService);

  readonly accounts = signal<WaSwitcherAccount[]>([]);
  readonly loaded = signal(false);
  readonly accountId = signal<number | null>(null);
  readonly phoneNumberId = signal<number | null>(null);

  readonly account = computed(() => this.accounts().find(a => a.id === this.accountId()) ?? null);
  readonly phoneNumbers = computed(() => {
    const a = this.account();
    return a ? a.phone_numbers : this.accounts().flatMap(x => x.phone_numbers);
  });
  readonly phoneNumber = computed(() => this.phoneNumbers().find(p => p.id === this.phoneNumberId()) ?? null);

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved) {
        this.accountId.set(saved.accountId ?? null);
        this.phoneNumberId.set(saved.phoneNumberId ?? null);
      }
    } catch {
      // storage blocked: start with "All"
    }
  }

  load(): void {
    this.api.switcher().subscribe({
      next: rows => {
        this.accounts.set(rows);
        this.loaded.set(true);
        // a remembered choice that is no longer visible falls back to "All"
        if (this.accountId() && !rows.some(a => a.id === this.accountId())) this.selectAccount(null);
        if (this.phoneNumberId() && !this.phoneNumbers().some(p => p.id === this.phoneNumberId())) this.selectPhoneNumber(null);
      },
      error: () => this.loaded.set(true),
    });
  }

  selectAccount(id: number | null): void {
    this.accountId.set(id);
    if (this.phoneNumberId() && !this.phoneNumbers().some(p => p.id === this.phoneNumberId())) this.phoneNumberId.set(null);
    this.persist();
  }

  selectPhoneNumber(id: number | null): void {
    this.phoneNumberId.set(id);
    if (id) {
      const owner = this.accounts().find(a => a.phone_numbers.some(p => p.id === id));
      if (owner && owner.id !== this.accountId()) this.accountId.set(owner.id);
    }
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accountId: this.accountId(), phoneNumberId: this.phoneNumberId() }));
    } catch {
      // not remembered: fine
    }
  }
}
