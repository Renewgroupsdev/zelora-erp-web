import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, filter, switchMap, timer } from 'rxjs';

import { ToastService } from '../../../shared/common-services/toast.service';
import { templatePreview } from '../templates/wa-templates';
import { WaPreviewModel, WaTemplatePreview } from '../templates/wa-template-preview';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppContextService } from '../whatsapp-context.service';
import { WaMessage, WaRecipient, WaTemplate } from '../whatsapp.models';

/**
 * Send WhatsApp Message: an approved template from a chosen business number to a customer. Only approved templates
 * of the number's own account are offered; parameter fields are generated from the template; marketing needs the
 * customer's opt-in. The result (Meta's message id, then sent / delivered / read / failed) is tracked below.
 */
@Component({
  selector: 'app-wa-send',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, WaTemplatePreview],
  templateUrl: './wa-send.html',
  styleUrl: './wa-send.scss',
})
export class WaSend implements OnInit, OnDestroy {
  private readonly api = inject(WhatsAppApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  readonly ctx = inject(WhatsAppContextService);

  readonly phoneId = signal<number | null>(null);
  readonly templates = signal<WaTemplate[]>([]);
  readonly templatesLoading = signal(false);
  readonly templateId = signal<number | null>(null);
  readonly results = signal<WaRecipient[]>([]);
  readonly searching = signal(false);
  readonly sending = signal(false);
  readonly uploading = signal(false);
  readonly sent = signal<WaMessage | null>(null);
  readonly recent = signal<WaMessage[]>([]);
  readonly tick = signal(0);
  readonly mediaPreviewUrl = signal<string | null>(null);

  to = '';
  name = '';
  recipient: WaRecipient | null = null;
  confirmOptIn = false;
  values: { header: { text: string; media_id: string; filename: string; link: string }; body: string[]; buttons: Record<number, string>; code: string } = blankValues();
  private wantedTemplate: number | null = null;
  private clientUid = uuid();
  private readonly search$ = new Subject<string>();
  private subs = new Subscription();
  private poll?: Subscription;

  /** Every enabled number of a connected account, grouped by account. */
  readonly numbers = computed(() => this.ctx.accounts().filter(a => a.status === 'connected').flatMap(a => a.phone_numbers.map(p => ({ ...p, accountId: a.id, accountName: a.name }))));
  readonly phone = computed(() => this.numbers().find(p => p.id === this.phoneId()) ?? null);
  readonly template = computed(() => this.templates().find(t => t.id === this.templateId()) ?? null);
  readonly params = computed(() => this.template()?.parameters ?? null);
  readonly needsOptIn = computed(() => this.template()?.category === 'MARKETING' && this.recipient?.opt_in_status !== 'opted_in');
  readonly optedOut = computed(() => { this.tick(); return this.template()?.category === 'MARKETING' && this.recipient?.opt_in_status === 'opted_out'; });

  readonly preview = computed<WaPreviewModel | null>(() => {
    this.tick();
    const t = this.template();
    if (!t) return null;
    const base = templatePreview(t, this.phone()?.verified_name);
    if (t.category === 'AUTHENTICATION') return base;
    const fill = (text: string) => text.replace(/\{\{(\d+)\}\}/g, (m, n) => this.values.body[Number(n) - 1]?.trim() || m);
    return {
      ...base,
      body: fill(base.body),
      header: base.header ? {
        ...base.header,
        text: (base.header.text ?? '').replace('{{1}}', this.values.header.text || '{{1}}'),
        mediaUrl: this.mediaPreviewUrl() ?? (this.values.header.link || null),
        filename: this.values.header.filename || null,
      } : null,
    };
  });

  readonly missing = computed(() => {
    this.tick();
    const p = this.params();
    const out: string[] = [];
    if (!this.phoneId()) out.push('Choose the sending number.');
    if (!this.to.trim()) out.push('Enter the customer\'s WhatsApp number.');
    if (!p) { out.push('Choose an approved template.'); return out; }
    if (p.otp) { if (!this.values.code.trim()) out.push('Enter the verification code.'); return out; }
    if (p.header?.type === 'text' && !this.values.header.text.trim()) out.push('Enter the header value.');
    if (p.header && p.header.type !== 'text' && !this.values.header.media_id && !this.values.header.link) out.push(`Attach the header ${p.header.type}.`);
    for (let i = 0; i < p.body; i++) if (!(this.values.body[i] ?? '').trim()) out.push(`Fill in {{${i + 1}}}.`);
    p.buttons.forEach(b => { if (!(this.values.buttons[b.index] ?? '').trim()) out.push(b.type === 'copy_code' ? 'Enter the coupon code.' : 'Enter the link value.'); });
    if (this.needsOptIn() && !this.confirmOptIn) out.push('Confirm the customer opted in to marketing.');
    return out;
  });

  ngOnInit(): void {
    this.ctx.load();
    this.wantedTemplate = Number(this.route.snapshot.queryParamMap.get('template')) || null;
    this.phoneId.set(this.ctx.phoneNumberId());

    this.subs.add(this.search$.pipe(
      debounceTime(300), distinctUntilChanged(), filter(s => s.trim().length >= 2),
      switchMap(s => { this.searching.set(true); return this.api.recipients(s.trim(), this.phone()?.accountId ?? null); }),
    ).subscribe({ next: r => { this.results.set(r); this.searching.set(false); }, error: () => this.searching.set(false) }));

    this.loadRecent();
  }

  private initialised = false;

  /** Once the account list has loaded: choose a sending number (header pick, else the default) and load its templates. */
  private readonly init = effect(() => {
    if (!this.ctx.loaded() || this.initialised) return;
    this.initialised = true;
    untracked(() => {
      // only a number Meta lets send: the header pick, else the default, else the first one that can send
      const usable = this.numbers().filter(p => !p.not_sendable_reason);
      const valid = usable.some(p => p.id === this.phoneId());
      if (!valid) this.phoneId.set(usable.find(p => p.is_default)?.id ?? usable[0]?.id ?? null);
      this.loadTemplates();
    });
  });
  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.poll?.unsubscribe();
    const url = this.mediaPreviewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  onPhoneChange(id: number | null): void {
    this.phoneId.set(id);
    this.templateId.set(null);
    this.resetValues();
    this.loadTemplates();
  }

  loadTemplates(): void {
    const accountId = this.phone()?.accountId;
    if (!accountId) { this.templates.set([]); return; }
    this.templatesLoading.set(true);
    this.api.templates({ account_id: accountId, sendable: 1, per_page: 200 }).subscribe({
      next: r => {
        this.templates.set(r.page?.data ?? []);
        this.templatesLoading.set(false);
        if (this.wantedTemplate && this.templates().some(t => t.id === this.wantedTemplate)) {
          this.onTemplateChange(this.wantedTemplate);
        }
        this.wantedTemplate = null;
      },
      error: err => {
        this.templatesLoading.set(false);
        this.templates.set([]);
        this.toast.error('Could not load templates', firstError(err));
      },
    });
  }

  onTemplateChange(id: number | null): void {
    this.templateId.set(id);
    this.resetValues();
    const p = this.params();
    if (p) this.values.body = Array.from({ length: p.body }, () => '');
    this.touch();
  }

  onSearch(v: string): void {
    this.to = v;
    this.recipient = null;
    this.search$.next(v);
    this.touch();
  }

  pick(r: WaRecipient): void {
    this.recipient = r;
    this.to = r.phone;
    this.name = r.name;
    this.results.set([]);
    if (r.source === 'contact' && r.account_id && r.account_id !== this.phone()?.accountId) {
      this.recipient = { ...r, opt_in_status: null }; // opt-in belongs to another account
    }
    this.touch();
  }

  onHeaderFile(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    const phone = this.phoneId();
    if (!file || !phone) return;
    const old = this.mediaPreviewUrl();
    if (old) URL.revokeObjectURL(old);
    this.mediaPreviewUrl.set(file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : null);
    this.uploading.set(true);
    this.api.uploadMedia(phone, file).subscribe({
      next: r => { this.values.header.media_id = r.data.media_id; this.values.header.filename = r.data.filename; this.uploading.set(false); this.touch(); },
      error: err => { this.uploading.set(false); this.toast.error('File not uploaded', err?.error?.message || firstError(err)); },
    });
  }

  send(): void {
    if (this.missing().length) { this.toast.warning('Complete the message', this.missing()[0]); return; }
    const t = this.template()!;
    const p = t.parameters;
    const values: any = p.otp ? { code: this.values.code } : {
      body: this.values.body.slice(0, p.body),
      buttons: this.values.buttons,
      header: p.header ? (p.header.type === 'text' ? { text: this.values.header.text } : {
        media_id: this.values.header.media_id || undefined, link: this.values.header.media_id ? undefined : this.values.header.link || undefined, filename: this.values.header.filename || undefined,
      }) : undefined,
    };

    this.sending.set(true);
    this.api.sendTemplate({
      phone_number_id: this.phoneId()!, to: this.to.trim(), name: this.name.trim() || null, template_id: t.id, values,
      confirm_opt_in: this.confirmOptIn, client_uid: this.clientUid,
    }).subscribe({
      next: r => {
        this.sending.set(false);
        this.sent.set(r.data);
        this.clientUid = uuid(); // the next click is a new message
        this.toast.success('Message sent', r.message);
        this.watch(r.data.id);
        this.loadRecent();
      },
      error: err => {
        this.sending.set(false);
        if (err?.error?.data?.id) {
          this.sent.set(err.error.data); // stored as failed, with Meta's reason
          this.clientUid = uuid();
          this.loadRecent();
        }
        this.toast.error('Not sent', firstError(err));
      },
    });
  }

  loadRecent(): void {
    this.api.messages({ source: 'template_send', per_page: 8 }).subscribe({ next: p => this.recent.set(p?.data ?? []) });
  }

  refreshSent(): void {
    const m = this.sent();
    if (m) this.api.message(m.id).subscribe({ next: x => this.sent.set(x) });
  }

  statusTone(s: string): string {
    return s === 'read' ? 'blue' : s === 'delivered' || s === 'sent' || s === 'accepted' ? 'green' : s === 'failed' ? 'red' : '';
  }

  touch(): void {
    this.tick.update(v => v + 1);
  }

  varLabel(n: number): string {
    return `{{${n}}}`;
  }

  /** Delivery receipts arrive by webhook; check the message a few times after sending. */
  private watch(id: number): void {
    this.poll?.unsubscribe();
    this.poll = timer(4000, 6000).pipe(switchMap(() => this.api.message(id))).subscribe(m => {
      this.sent.set(m);
      if (['read', 'failed'].includes(m.status)) this.poll?.unsubscribe();
    });
    setTimeout(() => this.poll?.unsubscribe(), 90000);
  }

  private resetValues(): void {
    this.values = blankValues();
    this.confirmOptIn = false;
    const url = this.mediaPreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.mediaPreviewUrl.set(null);
  }
}

function blankValues() {
  return { header: { text: '', media_id: '', filename: '', link: '' }, body: [] as string[], buttons: {} as Record<number, string>, code: '' };
}

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
}

function firstError(err: any): string {
  const errors = err?.error?.errors;
  return (errors ? (Object.values(errors).flat()[0] as string) : null) || err?.error?.message || 'Try again.';
}
