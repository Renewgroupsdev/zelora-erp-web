import { Injectable } from '@angular/core';
import { WaEmbeddedConfig } from './whatsapp.models';

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export interface EmbeddedSignupResult {
  code: string;
  wabaId: string | null;
  phoneNumberId: string | null;
}

/**
 * Meta's WhatsApp Embedded Signup in a popup (Facebook JS SDK). The popup returns a short-lived CODE - never a token -
 * which our API exchanges server side. The popup also posts a "WA_EMBEDDED_SIGNUP" message naming the WABA and number
 * the business picked; those ids are only hints, the server checks the token's own grants.
 */
@Injectable({ providedIn: 'root' })
export class FacebookEmbeddedSignupService {
  private sdk: Promise<any> | null = null;

  private loadSdk(cfg: WaEmbeddedConfig): Promise<any> {
    if (this.sdk) return this.sdk;

    this.sdk = new Promise((resolve, reject) => {
      const init = () => {
        window.FB.init({ appId: cfg.app_id, autoLogAppEvents: false, xfbml: false, version: cfg.graph_version });
        resolve(window.FB);
      };
      if (window.FB) return init();

      window.fbAsyncInit = init;
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onerror = () => {
        this.sdk = null;
        reject(new Error('The Facebook SDK could not be loaded. Check that connect.facebook.net is not blocked.'));
      };
      document.body.appendChild(script);
    });

    return this.sdk;
  }

  /** Opens the popup; resolves when the business finished signup, rejects when it was cancelled or failed. */
  async launch(cfg: WaEmbeddedConfig): Promise<EmbeddedSignupResult> {
    const FB = await this.loadSdk(cfg);

    let wabaId: string | null = null;
    let phoneNumberId: string | null = null;
    let cancelledAt: string | null = null;

    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)?facebook\.com$/.test(event.origin)) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (String(data.event).startsWith('FINISH')) {
          wabaId = data.data?.waba_id ?? null;
          phoneNumberId = data.data?.phone_number_id ?? null;
        } else if (data.event === 'CANCEL') {
          cancelledAt = data.data?.current_step ?? 'unknown step';
        }
      } catch {
        // not a signup message
      }
    };
    window.addEventListener('message', onMessage);

    try {
      const response: any = await new Promise(resolve => {
        FB.login(resolve, {
          config_id: cfg.config_id,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: cfg.solution_id ? { solutionID: cfg.solution_id } : {},
            featureType: '',
            sessionInfoVersion: '3',
          },
        });
      });

      const code = response?.authResponse?.code;
      if (!code) {
        throw new Error(cancelledAt ? `Signup was closed at "${cancelledAt}".` : 'Signup was cancelled before it finished.');
      }

      return { code, wabaId, phoneNumberId };
    } finally {
      window.removeEventListener('message', onMessage);
    }
  }
}
