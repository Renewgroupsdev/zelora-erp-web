import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppContextService } from '../whatsapp-context.service';
import { WaLanguage, WaTemplate } from '../whatsapp.models';
import { WaTemplatePreview, WaPreviewModel } from './wa-template-preview';

/**
 * WhatsApp Business -> Message Templates: every template of the accounts the user may see, with Meta's review status.
 * Filters by account (header switcher), category, status, language and name. Sync pulls the latest state from Meta.
 */
@Component({
  selector: 'app-wa-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, WaTemplatePreview],
  templateUrl: './wa-templates.html',
  styleUrl: './wa-templates.scss',
})
export class WaTemplates {
  private readonly api = inject(WhatsAppApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly ctx = inject(WhatsAppContextService);

  readonly rows = signal<WaTemplate[]>([]);
  readonly counts = signal<Record<string, number>>({});
  readonly languages = signal<WaLanguage[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal<Record<string, boolean>>({});
  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal(0);
  readonly selected = signal<WaTemplate | null>(null);

  readonly category = signal<string>('');
  readonly status = signal<string>('');
  readonly language = signal<string>('');
  readonly search = signal<string>('');
  private readonly search$ = new Subject<string>();

  readonly canEdit = computed(() => this.auth.hasActionAccess('edit-whatsapp-message-templates'));
  readonly canDelete = computed(() => this.auth.hasActionAccess('delete-whatsapp-message-templates'));
  readonly canSend = computed(() => this.auth.hasActionAccess('send-whatsapp-messages'));

  readonly statusChips = computed(() => {
    const c = this.counts();
    const all = Object.values(c).reduce((a, b) => a + Number(b), 0);
    return [
      { key: '', label: 'All', count: all },
      { key: 'APPROVED', label: 'Approved', count: Number(c['APPROVED'] ?? 0) },
      { key: 'PENDING', label: 'Pending', count: Number(c['PENDING'] ?? 0) + Number(c['IN_APPEAL'] ?? 0) },
      { key: 'REJECTED', label: 'Rejected', count: Number(c['REJECTED'] ?? 0) },
      { key: 'PAUSED', label: 'Paused', count: Number(c['PAUSED'] ?? 0) },
    ];
  });

  readonly preview = computed<WaPreviewModel | null>(() => {
    const t = this.selected();
    return t ? templatePreview(t) : null;
  });

  constructor() {
    effect(() => {
      // reload whenever a filter or the header account changes
      this.ctx.accountId(); this.category(); this.status(); this.language(); this.page();
      this.load();
    });
    // load() reads search(), so the effect above reloads
    this.search$.pipe(debounceTime(300)).subscribe(v => {
      this.search.set(v);
      this.page.set(1);
    });
  }

  onSearch(v: string): void {
    this.search$.next(v);
  }

  setFilter(kind: 'category' | 'status' | 'language', value: string): void {
    this[kind].set(value);
    this.page.set(1);
  }

  load(): void {
    this.loading.set(true);
    this.api.templates({
      account_id: this.ctx.accountId(), category: this.category(), status: this.status(), language: this.language(),
      search: this.search(), page: this.page(), per_page: 30,
    }).subscribe({
      next: r => {
        this.rows.set(r.page?.data ?? []);
        this.lastPage.set(r.page?.last_page ?? 1);
        this.total.set(r.page?.total ?? 0);
        this.counts.set(r.counts);
        this.languages.set(r.languages);
        this.loading.set(false);
        this.loadError.set(null);
        const sel = this.selected();
        if (sel) this.selected.set(this.rows().find(x => x.id === sel.id) ?? null);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message || 'Could not load templates.');
      },
    });
  }

  syncAll(): void {
    const accounts = this.ctx.accountId() ? [this.ctx.accountId()!] : this.ctx.accounts().filter(a => a.status === 'connected').map(a => a.id);
    if (!accounts.length) {
      this.toast.info('No connected account to sync');
      return;
    }
    this.busy.update(b => ({ ...b, all: true }));
    let left = accounts.length;
    const messages: string[] = [];
    const done = () => {
      if (--left > 0) return;
      this.busy.update(b => ({ ...b, all: false }));
      this.toast.success('Templates synced from Meta', messages.join(' '));
      this.load();
    };
    accounts.forEach(id => this.api.syncAccountTemplates(id).subscribe({
      next: r => messages.push(r.message),
      error: err => { messages.push(err?.error?.message || 'One account could not be synced.'); done(); },
      complete: () => done(),
    }));
  }

  syncOne(t: WaTemplate, ev?: Event): void {
    ev?.stopPropagation();
    this.run(`sync-${t.id}`, this.api.syncTemplate(t.id), r => {
      this.rows.update(rows => rows.map(x => (x.id === t.id ? r.data : x)));
      if (this.selected()?.id === t.id) this.selected.set(r.data);
      this.toast.success(r.message);
    });
  }

  async remove(t: WaTemplate, ev?: Event): Promise<void> {
    ev?.stopPropagation();
    const ok = await this.toast.confirm(`Delete "${t.name}" (${t.language_label})?`, 'It is deleted at Meta too. The same name cannot be reused for 30 days.');
    if (!ok) return;
    this.run(`del-${t.id}`, this.api.deleteTemplate(t.id), () => {
      if (this.selected()?.id === t.id) this.selected.set(null);
      this.toast.success('Template deleted');
      this.load();
    });
  }

  edit(t: WaTemplate, ev?: Event): void {
    ev?.stopPropagation();
    this.router.navigate(['/app/whatsapp/templates', t.id, 'edit']);
  }

  /** A copy to submit as a new template (Meta needs a new name; useful to change a category or language). */
  duplicate(t: WaTemplate, ev?: Event): void {
    ev?.stopPropagation();
    this.router.navigate(['/app/whatsapp/templates/new'], { queryParams: { from: t.id, ...(t.category === 'AUTHENTICATION' ? { kind: 'authentication' } : {}) } });
  }

  view(t: WaTemplate, ev?: Event): void {
    ev?.stopPropagation();
    this.selected.set(t);
  }

  /** "Image header · footer · 3 buttons (2 quick reply, 1 website)" for the row. */
  anatomy(t: WaTemplate): { header: string; footer: string | null; buttons: string | null } {
    const comps = t.components ?? [];
    const find = (type: string) => comps.find((c: any) => String(c.type).toUpperCase() === type);
    const header = find('HEADER');
    const footer = find('FOOTER');
    const buttons: any[] = find('BUTTONS')?.buttons ?? [];
    const kinds: Record<string, string> = { QUICK_REPLY: 'quick reply', URL: 'website', PHONE_NUMBER: 'call', COPY_CODE: 'copy code', OTP: 'code', FLOW: 'flow' };
    const counts = buttons.reduce((acc: Record<string, number>, b: any) => { const k = kinds[String(b.type).toUpperCase()] ?? 'button'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
    return {
      header: header ? `${String(header.format ?? 'TEXT').charAt(0)}${String(header.format ?? 'TEXT').slice(1).toLowerCase()} header` : 'No header',
      footer: footer?.text ?? (footer?.code_expiration_minutes ? `Expires in ${footer.code_expiration_minutes} min` : null),
      buttons: buttons.length ? `${buttons.length} button${buttons.length > 1 ? 's' : ''} (${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')})` : null,
    };
  }

  send(t: WaTemplate, ev?: Event): void {
    ev?.stopPropagation();
    this.router.navigate(['/app/whatsapp/send'], { queryParams: { template: t.id } });
  }

  statusTone(s: string): string {
    return s === 'APPROVED' ? 'green' : s === 'REJECTED' || s === 'DISABLED' || s === 'DELETED' ? 'red' : s === 'PAUSED' ? 'orange' : 'blue';
  }

  private run<T>(key: string, obs: import('rxjs').Observable<T>, done: (v: T) => void): void {
    this.busy.update(b => ({ ...b, [key]: true }));
    obs.subscribe({
      next: v => { this.busy.update(b => ({ ...b, [key]: false })); done(v); },
      error: err => { this.busy.update(b => ({ ...b, [key]: false })); this.toast.error('Could not complete the action', err?.error?.message || 'Try again.'); },
    });
  }
}

/** Preview model of a stored template (examples fill the variables). */
export function templatePreview(t: WaTemplate, businessName?: string | null): WaPreviewModel {
  const comps = t.components ?? [];
  const find = (type: string) => comps.find((c: any) => String(c.type).toUpperCase() === type);
  const header = find('HEADER');
  const body = find('BODY');
  const footer = find('FOOTER');
  const buttons = find('BUTTONS');

  if (t.category === 'AUTHENTICATION') {
    const btn = buttons?.buttons?.[0] ?? {};
    return {
      body: '', businessName,
      auth: {
        otpType: String(btn.otp_type ?? 'COPY_CODE').toUpperCase(),
        securityRecommendation: body?.add_security_recommendation ?? /security/i.test(body?.text ?? ''),
        expiryMinutes: footer?.code_expiration_minutes ?? null,
        buttonText: btn.text ?? 'Copy code',
        autofillText: btn.autofill_text ?? 'Autofill',
      },
    };
  }

  return {
    businessName,
    header: header ? { format: String(header.format ?? 'TEXT').toUpperCase(), text: header.text, mediaUrl: header.example?.header_url?.[0] ?? null } : null,
    body: body?.text ?? t.body ?? '',
    footer: footer?.text ?? null,
    buttons: (buttons?.buttons ?? []).map((b: any) => ({ type: String(b.type).toUpperCase(), text: b.text })),
  };
}
