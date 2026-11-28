import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastService } from '../../../shared/common-services/toast.service';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppContextService } from '../whatsapp-context.service';
import { WaButtonType, WaLanguage, WaTemplate, WaTemplateForm } from '../whatsapp.models';
import { WaPreviewModel, WaTemplatePreview } from './wa-template-preview';

const BUTTON_LIMITS: Record<string, number> = { URL: 2, PHONE_NUMBER: 1, COPY_CODE: 1, FLOW: 1, QUICK_REPLY: 10 };

/**
 * Template builder (WhatsApp Business -> Message Templates -> New / Edit). Left: the form, with Meta's limits checked
 * as you type. Right: a live WhatsApp preview. Authentication templates (?kind=authentication) get their own form:
 * Meta writes their text, so only the code button and the optional security / expiry lines are configured.
 * The server validates again and turns the form into Meta's payload; nothing here talks to Meta directly.
 */
@Component({
  selector: 'app-wa-template-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, WaTemplatePreview],
  templateUrl: './wa-template-builder.html',
  styleUrl: './wa-template-builder.scss',
})
export class WaTemplateBuilder implements OnInit, OnDestroy {
  private readonly api = inject(WhatsAppApiService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly ctx = inject(WhatsAppContextService);

  readonly editing = signal<WaTemplate | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly languages = signal<WaLanguage[]>([]);
  readonly serverErrors = signal<Record<string, string>>({});
  readonly tick = signal(0);
  readonly mediaPreviewUrl = signal<string | null>(null);
  readonly mediaFileName = signal<string | null>(null);

  form: WaTemplateForm = blankForm();

  readonly isAuth = computed(() => { this.tick(); return this.form.category === 'AUTHENTICATION'; });
  readonly connectedAccounts = computed(() => this.ctx.accounts().filter(a => a.status === 'connected'));

  /** Distinct {{n}} in the body, as the user types. */
  readonly bodyVars = computed(() => { this.tick(); return variables(this.form.body.text); });
  readonly headerVars = computed(() => { this.tick(); return this.form.header.format === 'TEXT' ? variables(this.form.header.text ?? '') : []; });

  /** Problems found before submitting (the server checks the same rules again). */
  readonly issues = computed(() => {
    this.tick();
    const f = this.form;
    const out: string[] = [];
    if (!this.editing()) {
      if (!f.account_id) out.push('Choose the WhatsApp account.');
      if (!/^[a-z0-9_]+$/.test(f.name ?? '')) out.push('Template name: lowercase letters, numbers and underscores only.');
      if (!f.language) out.push('Choose a language.');
    }
    if (f.category === 'AUTHENTICATION') {
      const a = f.auth;
      if (a.code_expiration_minutes !== null && (a.code_expiration_minutes < 1 || a.code_expiration_minutes > 90)) out.push('Code expiry must be 1 to 90 minutes.');
      if (a.otp_type !== 'COPY_CODE' && !a.supported_apps.some(x => x.package_name && x.signature_hash)) out.push('Add your Android app package name and signature hash.');
      if (a.otp_type === 'ZERO_TAP' && !a.zero_tap_terms_accepted) out.push("Accept Meta's zero-tap terms.");
      return out;
    }
    const vars = this.bodyVars();
    if (!f.body.text.trim()) out.push('Write the message text.');
    if (f.body.text.length > 1024) out.push('Message text: at most 1024 characters.');
    if (vars.length && vars.join(',') !== vars.map((_, i) => i + 1).join(',')) out.push('Number variables {{1}}, {{2}}, {{3}} … without gaps.');
    if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(f.body.text)) out.push('A variable cannot be the very first or last thing in the message.');
    if (vars.some((_, i) => !(f.body.examples[i] ?? '').trim())) out.push('Give a sample value for every variable.');
    if (f.header.format === 'TEXT' && (f.header.text ?? '').length > 60) out.push('Header: at most 60 characters.');
    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(f.header.format) && !f.header.media_handle) out.push('Upload a sample header file.');
    if (f.footer.text.length > 60) out.push('Footer: at most 60 characters.');
    f.buttons.forEach((b, i) => {
      if (b.type !== 'COPY_CODE' && !(b.text ?? '').trim()) out.push(`Button ${i + 1}: enter its text.`);
      if (b.type === 'URL' && !/^https?:\/\/\S+$/i.test(b.url ?? '')) out.push(`Button ${i + 1}: enter a full website address.`);
      if (b.type === 'PHONE_NUMBER' && !/^\+?\d{8,20}$/.test((b.phone_number ?? '').replace(/[\s-]/g, ''))) out.push(`Button ${i + 1}: enter a phone number with country code.`);
    });
    return out;
  });

  readonly preview = computed<WaPreviewModel>(() => {
    this.tick();
    const f = this.form;
    const name = this.ctx.accounts().find(a => a.id === f.account_id)?.phone_numbers[0]?.verified_name ?? null;
    if (f.category === 'AUTHENTICATION') {
      return {
        body: '', businessName: name,
        auth: {
          otpType: f.auth.otp_type, securityRecommendation: f.auth.add_security_recommendation, expiryMinutes: f.auth.code_expiration_minutes,
          buttonText: f.auth.button_text, autofillText: f.auth.autofill_text,
        },
      };
    }
    const fill = (text: string, values: string[]) => text.replace(/\{\{(\d+)\}\}/g, (m, n) => values[Number(n) - 1]?.trim() || m);
    return {
      businessName: name,
      header: f.header.format === 'NONE' ? null : {
        format: f.header.format, text: fill(f.header.text ?? '', [f.header.example ?? '']),
        mediaUrl: this.mediaPreviewUrl(), filename: this.mediaFileName(),
      },
      body: fill(f.body.text, f.body.examples),
      footer: f.footer.text,
      buttons: f.buttons.map(b => ({ type: b.type, text: b.text })),
    };
  });

  ngOnInit(): void {
    this.ctx.load();
    this.api.templates({ per_page: 1 }).subscribe({ next: r => this.languages.set(r.languages) });

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.loading.set(true);
      this.api.template(id).subscribe({
        next: t => {
          this.editing.set(t);
          this.form = formFromTemplate(t);
          this.loading.set(false);
          this.touch();
        },
        error: err => {
          this.loading.set(false);
          this.toast.error('Could not open the template', err?.error?.message);
          this.router.navigate(['/app/whatsapp/templates']);
        },
      });
      return;
    }

    // Duplicate: a copy of an existing template, submitted to Meta as a NEW template (Meta needs a new name)
    const fromId = Number(this.route.snapshot.queryParamMap.get('from'));
    if (fromId) {
      this.loading.set(true);
      this.api.template(fromId).subscribe({
        next: t => {
          this.form = formFromTemplate(t);
          this.form.account_id = t.account_id;
          this.form.language = t.language;
          this.form.name = `${t.name}_copy`.slice(0, 512);
          this.loading.set(false);
          this.touch();
          if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(this.form.header.format)) {
            this.form.header.media_handle = '';
            this.toast.info('Upload the header sample again', 'Meta needs the sample file once more for the new template.');
          }
        },
        error: err => { this.loading.set(false); this.toast.error('Could not copy the template', err?.error?.message); },
      });
      return;
    }

    if (this.route.snapshot.queryParamMap.get('kind') === 'authentication') {
      this.form.category = 'AUTHENTICATION';
    }
    this.form.account_id = this.ctx.accountId() ?? this.connectedAccounts()[0]?.id ?? null;
    this.touch();
  }

  ngOnDestroy(): void {
    const url = this.mediaPreviewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  touch(): void {
    // keep one example slot per body variable
    const n = variables(this.form.body.text).length;
    while (this.form.body.examples.length < n) this.form.body.examples.push('');
    this.tick.update(v => v + 1);
  }

  normalizeName(): void {
    this.form.name = (this.form.name ?? '').toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
    this.touch();
  }

  setCategory(c: 'MARKETING' | 'UTILITY'): void {
    this.form.category = c;
    if (c !== 'MARKETING') this.form.buttons = this.form.buttons.filter(b => b.type !== 'COPY_CODE');
    this.touch();
  }

  addVariable(target: 'body' | 'header'): void {
    if (target === 'header') {
      if (!this.headerVars().length) this.form.header.text = `${this.form.header.text ?? ''} {{1}}`.trimStart();
    } else {
      const next = (this.bodyVars().at(-1) ?? 0) + 1;
      this.form.body.text = `${this.form.body.text}${this.form.body.text.endsWith(' ') || !this.form.body.text ? '' : ' '}{{${next}}}`;
    }
    this.touch();
  }

  wrap(textarea: HTMLTextAreaElement, mark: string): void {
    const { selectionStart: s, selectionEnd: e, value } = textarea;
    const selected = value.slice(s, e) || 'text';
    this.form.body.text = value.slice(0, s) + mark + selected + mark + value.slice(e);
    this.touch();
    queueMicrotask(() => { textarea.focus(); textarea.setSelectionRange(s + mark.length, s + mark.length + selected.length); });
  }

  canAdd(type: WaButtonType): boolean {
    this.tick();
    if (this.form.buttons.length >= 10) return false;
    if (type === 'COPY_CODE' && this.form.category !== 'MARKETING') return false;
    return this.form.buttons.filter(b => b.type === type).length < BUTTON_LIMITS[type];
  }

  addButton(type: WaButtonType): void {
    if (!this.canAdd(type)) return;
    const b = { type, text: '', url: '', example: '', phone_number: '', flow_id: '', flow_action: 'navigate' as const };
    // keep quick replies grouped together (Meta rule)
    if (type === 'QUICK_REPLY') {
      const lastQr = this.form.buttons.map(x => x.type).lastIndexOf('QUICK_REPLY');
      lastQr >= 0 ? this.form.buttons.splice(lastQr + 1, 0, b) : this.form.buttons.unshift(b);
    } else {
      this.form.buttons.push(b);
    }
    this.touch();
  }

  removeButton(i: number): void {
    this.form.buttons.splice(i, 1);
    this.touch();
  }

  addApp(): void {
    if (this.form.auth.supported_apps.length < 5) this.form.auth.supported_apps.push({ package_name: '', signature_hash: '' });
    this.touch();
  }

  removeApp(i: number): void {
    this.form.auth.supported_apps.splice(i, 1);
    this.touch();
  }

  onHeaderFile(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    const accountId = this.form.account_id ?? this.editing()?.account_id;
    if (!file || !accountId) return;
    const old = this.mediaPreviewUrl();
    if (old) URL.revokeObjectURL(old);
    this.mediaPreviewUrl.set(file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : null);
    this.mediaFileName.set(file.name);
    this.uploading.set(true);
    this.api.uploadTemplateSample(accountId, this.form.header.format, file).subscribe({
      next: r => { this.form.header.media_handle = r.data.handle; this.uploading.set(false); this.touch(); },
      error: err => { this.uploading.set(false); this.toast.error('Sample not uploaded', firstError(err)); },
    });
  }

  submit(): void {
    if (this.issues().length) {
      this.toast.warning('Check the template', this.issues()[0]);
      return;
    }
    this.serverErrors.set({});
    this.saving.set(true);
    const t = this.editing();
    const payload = payloadFromForm(this.form, !t);
    const req = t ? this.api.updateTemplate(t.id, payload) : this.api.createTemplate(payload);
    req.subscribe({
      next: r => {
        this.saving.set(false);
        const tone = r.data.status === 'REJECTED' ? 'warning' : 'success';
        this.toast[tone](t ? 'Changes submitted' : 'Template submitted', r.message);
        this.router.navigate(['/app/whatsapp/templates']);
      },
      error: err => {
        this.saving.set(false);
        const errors = err?.error?.errors ?? {};
        const flat: Record<string, string> = {};
        Object.entries(errors).forEach(([k, v]) => (flat[k] = Array.isArray(v) ? String(v[0]) : String(v)));
        this.serverErrors.set(flat);
        this.toast.error('Meta / validation error', firstError(err));
      },
    });
  }

  err(key: string): string | null {
    return this.serverErrors()[key] ?? null;
  }

  readonly serverErrorList = computed(() => Object.values(this.serverErrors()));
  trackIndex = (i: number) => i;

  // literal placeholders for the template (a "}}" inside an Angular expression would end it)
  readonly V1 = '{{1}}';
  readonly V2 = '{{2}}';
  varLabel(n: number): string { return `{{${n}}}`; }
  hasUrlVar(b: { url?: string }): boolean { return (b.url ?? '').includes('{{1}}'); }

  readonly otpOptions = [
    { k: 'COPY_CODE', t: 'Copy code', d: 'A button copies the code. Works on every phone.', i: 'bi-copy' },
    { k: 'ONE_TAP', t: 'One-tap autofill', d: 'Android: one tap fills the code into your app. Falls back to copy code.', i: 'bi-hand-index' },
    { k: 'ZERO_TAP', t: 'Zero-tap', d: 'Android: the code reaches your app automatically. Falls back to one-tap / copy code.', i: 'bi-lightning-charge' },
  ];
}

// ---- helpers ----

function variables(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

function blankForm(): WaTemplateForm {
  return {
    account_id: null, name: '', language: 'en', category: 'UTILITY', allow_category_change: false, message_send_ttl_seconds: null,
    header: { format: 'NONE', text: '', example: '', media_handle: '' },
    body: { text: '', examples: [] },
    footer: { text: '' },
    buttons: [],
    auth: {
      otp_type: 'COPY_CODE', add_security_recommendation: true, code_expiration_minutes: 10, button_text: 'Copy code', autofill_text: 'Autofill',
      supported_apps: [], zero_tap_terms_accepted: false,
    },
  };
}

function formFromTemplate(t: WaTemplate): WaTemplateForm {
  const f = blankForm();
  f.category = t.category;
  const comps = t.components ?? [];
  const find = (type: string) => comps.find((c: any) => String(c.type).toUpperCase() === type);
  const header = find('HEADER');
  const body = find('BODY');
  const footer = find('FOOTER');
  const buttons = find('BUTTONS')?.buttons ?? [];

  if (t.category === 'AUTHENTICATION') {
    const b = buttons[0] ?? {};
    f.auth = {
      otp_type: String(b.otp_type ?? 'COPY_CODE').toUpperCase() as any,
      add_security_recommendation: body?.add_security_recommendation ?? /security/i.test(body?.text ?? ''),
      code_expiration_minutes: footer?.code_expiration_minutes ?? null,
      button_text: b.text ?? 'Copy code', autofill_text: b.autofill_text ?? 'Autofill',
      supported_apps: b.supported_apps ?? [], zero_tap_terms_accepted: !!b.zero_tap_terms_accepted,
    };
    return f;
  }

  if (header) {
    f.header = {
      format: String(header.format ?? 'TEXT').toUpperCase() as any, text: header.text ?? '',
      example: header.example?.header_text?.[0] ?? '', media_handle: header.example?.header_handle?.[0] ?? '',
    };
  }
  f.body = { text: body?.text ?? t.body ?? '', examples: [...(body?.example?.body_text?.[0] ?? [])] };
  f.footer = { text: footer?.text ?? '' };
  f.buttons = buttons.map((b: any) => ({
    type: String(b.type).toUpperCase(), text: b.text ?? '', url: b.url ?? '', phone_number: b.phone_number ?? '',
    example: Array.isArray(b.example) ? b.example[0] : (b.example ?? ''), flow_id: b.flow_id ? String(b.flow_id) : '',
    flow_action: b.flow_action ?? 'navigate', navigate_screen: b.navigate_screen ?? '',
  }));
  return f;
}

function payloadFromForm(f: WaTemplateForm, creating: boolean): any {
  const base: any = { category: f.category };
  if (creating) Object.assign(base, { account_id: f.account_id, name: f.name, language: f.language });
  if (f.category === 'AUTHENTICATION') {
    return { ...base, message_send_ttl_seconds: f.message_send_ttl_seconds || null, auth: { ...f.auth, supported_apps: f.auth.otp_type === 'COPY_CODE' ? [] : f.auth.supported_apps } };
  }
  const vars = variables(f.body.text).length;
  return {
    ...base,
    allow_category_change: !!f.allow_category_change,
    header: f.header,
    body: { text: f.body.text, examples: f.body.examples.slice(0, vars) },
    footer: f.footer,
    buttons: f.buttons,
  };
}

function firstError(err: any): string {
  const errors = err?.error?.errors;
  return (errors ? (Object.values(errors).flat()[0] as string) : null) || err?.error?.message || 'Try again.';
}
