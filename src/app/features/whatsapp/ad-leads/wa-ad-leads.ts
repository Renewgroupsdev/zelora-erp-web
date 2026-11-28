import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../../shared/common-services/toast.service';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppContextService } from '../whatsapp-context.service';
import { WaAdLeadsReport } from '../whatsapp.models';

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';

/**
 * Settings -> WhatsApp Business -> Ad Leads: customers who came to WhatsApp from a Facebook / Instagram Click-to-WhatsApp
 * ad, next to normal WhatsApp chats. Source, ad and campaign come from the referral Meta attaches to the first message.
 */
@Component({
  selector: 'app-wa-ad-leads',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './wa-ad-leads.html',
  styleUrl: './wa-ad-leads.scss',
})
export class WaAdLeads {
  private readonly api = inject(WhatsAppApiService);
  private readonly toast = inject(ToastService);
  readonly ctx = inject(WhatsAppContextService);

  readonly report = signal<WaAdLeadsReport | null>(null);
  readonly loading = signal(true);
  readonly preset = signal<Preset>('month');
  readonly from = signal(iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly to = signal(iso(new Date()));
  readonly platform = signal('');
  readonly campaignId = signal('');
  readonly page = signal(1);

  readonly presets: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Today' }, { key: '7d', label: 'Last 7 days' }, { key: '30d', label: 'Last 30 days' }, { key: 'month', label: 'This month' }, { key: 'custom', label: 'Custom' },
  ];

  readonly trendMax = computed(() => Math.max(1, ...(this.report()?.trend ?? []).map(t => t.facebook + t.instagram + t.other)));
  readonly campaignMax = computed(() => Math.max(1, ...(this.report()?.by_campaign ?? []).map(c => c.leads)));
  readonly share = computed(() => {
    const s = this.report()?.summary;
    const total = s ? s.total || 1 : 1;
    return s ? { facebook: (s.facebook / total) * 100, instagram: (s.instagram / total) * 100, other: (s.other_ads / total) * 100, organic: (s.organic / total) * 100 } : null;
  });

  constructor() {
    this.ctx.load();
    effect(() => {
      this.ctx.accountId(); this.from(); this.to(); this.platform(); this.campaignId(); this.page();
      untracked(() => this.load());
    });
  }

  setPreset(p: Preset): void {
    this.preset.set(p);
    const now = new Date();
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    if (p === 'today') { this.from.set(iso(now)); this.to.set(iso(now)); }
    if (p === '7d') { this.from.set(iso(days(6))); this.to.set(iso(now)); }
    if (p === '30d') { this.from.set(iso(days(29))); this.to.set(iso(now)); }
    if (p === 'month') { this.from.set(iso(new Date(now.getFullYear(), now.getMonth(), 1))); this.to.set(iso(now)); }
    this.page.set(1);
  }

  load(): void {
    this.loading.set(true);
    this.api.adLeads({
      account_id: this.ctx.accountId(), from: this.from(), to: this.to(), platform: this.platform() || null, campaign_id: this.campaignId() || null, page: this.page(), per_page: 20,
    }).subscribe({
      next: r => { this.report.set(r); this.loading.set(false); },
      error: err => { this.loading.set(false); this.toast.error('Could not load ad leads', err?.error?.message); },
    });
  }

  label(src: string | null | undefined): string {
    return src === 'facebook_ad' || src === 'facebook' ? 'Facebook Ad' : src === 'instagram_ad' || src === 'instagram' ? 'Instagram Ad' : 'Meta Ad';
  }

  srcKey(src: string | null | undefined): string {
    return src?.startsWith('facebook') ? 'facebook_ad' : src?.startsWith('instagram') ? 'instagram_ad' : 'ad';
  }

  avatarColor(seed: string | null | undefined): string {
    const palette = ['#25d366', '#00a884', '#53bdeb', '#7f66ff', '#ff8c00', '#e5527f', '#02a698', '#d44f9b', '#5f6ff0', '#c79b00'];
    let h = 0;
    for (const ch of String(seed ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  }

  initials(name: string | null | undefined): string {
    const clean = String(name ?? '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
    return clean && !/^\d/.test(clean) ? clean.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() : '#';
  }
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
