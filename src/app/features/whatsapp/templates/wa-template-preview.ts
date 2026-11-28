import { Component, computed, input } from '@angular/core';

export interface WaPreviewButton { type: string; text?: string; }

export interface WaPreviewModel {
  header?: { format: string; text?: string; mediaUrl?: string | null; filename?: string | null } | null;
  body: string;
  footer?: string | null;
  buttons?: WaPreviewButton[];
  /** Authentication template: Meta writes the text. */
  auth?: { otpType: string; securityRecommendation: boolean; expiryMinutes: number | null; buttonText: string; autofillText: string } | null;
  businessName?: string | null;
}

/**
 * How the message will look in a WhatsApp chat on a phone. Variables still unfilled are shown as {{n}} chips;
 * WhatsApp formatting (*bold*, _italic_, ~strike~, ```mono```) is rendered.
 */
@Component({
  selector: 'app-wa-template-preview',
  standalone: true,
  templateUrl: './wa-template-preview.html',
  styleUrl: './wa-template-preview.scss',
})
export class WaTemplatePreview {
  readonly model = input.required<WaPreviewModel>();

  readonly bodyHtml = computed(() => {
    const m = this.model();
    if (m.auth) {
      let text = '*123456* is your verification code.';
      if (m.auth.securityRecommendation) text += ' For your security, do not share this code.';
      return format(text);
    }
    return format(m.body || 'Your message text appears here.');
  });

  readonly headerHtml = computed(() => format(this.model().header?.text ?? ''));

  readonly footer = computed(() => {
    const m = this.model();
    if (m.auth) return m.auth.expiryMinutes ? `This code expires in ${m.auth.expiryMinutes} minutes.` : '';
    return m.footer ?? '';
  });

  readonly buttons = computed<WaPreviewButton[]>(() => {
    const m = this.model();
    if (m.auth) {
      const copy = { type: 'COPY_CODE', text: m.auth.buttonText || 'Copy code' };
      return m.auth.otpType === 'COPY_CODE' ? [copy] : [{ type: 'AUTOFILL', text: m.auth.autofillText || 'Autofill' }];
    }
    return (m.buttons ?? []).filter(b => b.type === 'COPY_CODE' || (b.text ?? '').trim() !== '');
  });

  readonly time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  icon(type: string): string {
    switch (type) {
      case 'URL': return 'bi-box-arrow-up-right';
      case 'PHONE_NUMBER': return 'bi-telephone-fill';
      case 'COPY_CODE': return 'bi-copy';
      case 'FLOW': return 'bi-ui-checks';
      case 'AUTOFILL': return 'bi-magic';
      default: return 'bi-reply-fill';
    }
  }
}

/** Escapes HTML, then applies WhatsApp's lightweight formatting and highlights {{n}} placeholders. */
function format(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/```([^`]+)```/g, '<code>$1</code>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/\{\{(\d+)\}\}/g, '<span class="var">{{$1}}</span>')
    .replace(/\n/g, '<br>');
}
