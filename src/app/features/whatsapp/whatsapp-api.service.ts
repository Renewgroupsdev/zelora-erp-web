import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import {
  WaAccount,
  WaAdLeadsReport,
  WaConversation,
  WaConversationDetails,
  WaNote,
  WaFlow,
  WaAccountGrant,
  WaAccountsMeta,
  WaConnectSession,
  WaEmbeddedConfig,
  WaLanguage,
  WaMessage,
  WaPage,
  WaPhoneNumber,
  WaRecipient,
  WaSendValues,
  WaSwitcherAccount,
  WaTemplate,
} from './whatsapp.models';

/**
 * Every call of the WhatsApp Business module goes to our Laravel API, never to Meta: the server holds the tokens
 * and talks to the Graph API with the right account's credentials.
 */
@Injectable({ providedIn: 'root' })
export class WhatsAppApiService {
  private readonly api = inject(ApiDataService);
  private readonly R = ApiRoutesConstants;

  // ---- accounts ----

  accounts(): Observable<{ data: WaAccount[]; meta: WaAccountsMeta }> {
    return (this.api.GET(this.R.WA_ACCOUNTS) as Observable<any>).pipe(map(r => ({ data: r?.data ?? [], meta: r?.meta })));
  }

  switcher(): Observable<WaSwitcherAccount[]> {
    return (this.api.GET(this.R.WA_SWITCHER) as Observable<any>).pipe(map(r => r?.data ?? []));
  }

  updateAccount(id: number, body: Partial<Pick<WaAccount, 'name' | 'restrict_access' | 'branch_type' | 'branch_id'>> & { settings?: Record<string, unknown> }): Observable<WaAccount> {
    return (this.api.PUT(`${this.R.WA_ACCOUNTS}/${id}`, body) as Observable<any>).pipe(map(r => r.data));
  }

  refreshAccount(id: number): Observable<{ message: string; data: WaAccount }> {
    return this.api.POST(`${this.R.WA_ACCOUNTS}/${id}/refresh`, {}) as Observable<any>;
  }

  validateToken(id: number): Observable<{ message: string; data: WaAccount }> {
    return this.api.POST(`${this.R.WA_ACCOUNTS}/${id}/validate-token`, {}) as Observable<any>;
  }

  disconnect(id: number): Observable<{ message: string; data: WaAccount }> {
    return this.api.Delete(`${this.R.WA_ACCOUNTS}/${id}`, {}) as Observable<any>;
  }

  permissions(id: number): Observable<{ restrict_access: boolean; grants: WaAccountGrant[] }> {
    return (this.api.GET(`${this.R.WA_ACCOUNTS}/${id}/permissions`) as Observable<any>).pipe(map(r => r.data));
  }

  savePermissions(id: number, grants: WaAccountGrant[]): Observable<{ restrict_access: boolean; grants: WaAccountGrant[] }> {
    return (this.api.PUT(`${this.R.WA_ACCOUNTS}/${id}/permissions`, { grants }) as Observable<any>).pipe(map(r => r.data));
  }

  // ---- connect (two steps: session, then finish) ----

  connectConfig(): Observable<WaEmbeddedConfig> {
    return (this.api.GET(this.R.WA_CONNECT_CONFIG) as Observable<any>).pipe(map(r => r.data));
  }

  connectEmbedded(body: { code: string; state: string; waba_id?: string | null; phone_number_id?: string | null }): Observable<WaConnectSession> {
    return (this.api.POST(this.R.WA_CONNECT_EMBEDDED, body) as Observable<any>).pipe(map(r => r.data));
  }

  connectToken(body: { access_token: string; waba_id?: string | null }): Observable<WaConnectSession> {
    return (this.api.POST(this.R.WA_CONNECT_TOKEN, body) as Observable<any>).pipe(map(r => r.data));
  }

  connectFinish(body: { session_id: string; waba_ids: string[]; name?: string | null; branch_type?: string | null; branch_id?: number | null; restrict_access?: boolean }): Observable<{ message: string; data: WaAccount[] }> {
    return this.api.POST(this.R.WA_CONNECT_FINISH, body) as Observable<any>;
  }

  // ---- templates ----

  templates(params: Record<string, string | number | boolean | null | undefined> = {}): Observable<{ page: WaPage<WaTemplate>; counts: Record<string, number>; languages: WaLanguage[] }> {
    return (this.api.GET(this.R.WA_TEMPLATES + this.qs(params)) as Observable<any>).pipe(
      map(r => ({ page: r?.data, counts: r?.meta?.counts ?? {}, languages: r?.meta?.languages ?? [] })),
    );
  }

  template(id: number): Observable<WaTemplate> {
    return (this.api.GET(`${this.R.WA_TEMPLATES}/${id}`) as Observable<any>).pipe(map(r => r.data));
  }

  createTemplate(body: any): Observable<{ message: string; data: WaTemplate }> {
    return this.api.POST(this.R.WA_TEMPLATES, body) as Observable<any>;
  }

  updateTemplate(id: number, body: any): Observable<{ message: string; data: WaTemplate }> {
    return this.api.PUT(`${this.R.WA_TEMPLATES}/${id}`, body) as Observable<any>;
  }

  deleteTemplate(id: number): Observable<{ message: string }> {
    return this.api.Delete(`${this.R.WA_TEMPLATES}/${id}`, {}) as Observable<any>;
  }

  syncTemplate(id: number): Observable<{ message: string; data: WaTemplate }> {
    return this.api.POST(`${this.R.WA_TEMPLATES}/${id}/sync`, {}) as Observable<any>;
  }

  syncAccountTemplates(accountId: number): Observable<{ message: string; data: { created: number; updated: number; removed: number } }> {
    return this.api.POST(`${this.R.WA_ACCOUNTS}/${accountId}/templates/sync`, {}) as Observable<any>;
  }

  uploadTemplateSample(accountId: number, type: string, file: File): Observable<{ data: { handle: string } }> {
    const form = new FormData();
    form.append('type', type);
    form.append('file', file);
    return this.api.POST(`${this.R.WA_ACCOUNTS}/${accountId}/templates/sample`, form) as Observable<any>;
  }

  // ---- messages ----

  sendTemplate(body: { phone_number_id: number; to: string; name?: string | null; template_id: number; values: WaSendValues; confirm_opt_in?: boolean; client_uid: string }): Observable<{ success: boolean; message: string; data: WaMessage }> {
    return this.api.POST(this.R.WA_SEND_TEMPLATE, body) as Observable<any>;
  }

  uploadMedia(phoneNumberId: number, file: File): Observable<{ data: { media_id: string; mime: string; filename: string } }> {
    const form = new FormData();
    form.append('file', file);
    return this.api.POST(`${this.R.WA_PHONE_NUMBERS}/${phoneNumberId}/media`, form) as Observable<any>;
  }

  recipients(search: string, accountId: number | null): Observable<WaRecipient[]> {
    return (this.api.GET(this.R.WA_RECIPIENTS + this.qs({ search, account_id: accountId })) as Observable<any>).pipe(map(r => r?.data ?? []));
  }

  messages(params: Record<string, string | number | boolean | null | undefined> = {}): Observable<WaPage<WaMessage>> {
    return (this.api.GET(this.R.WA_MESSAGES + this.qs(params)) as Observable<any>).pipe(map(r => r?.data));
  }

  message(id: number): Observable<WaMessage & { receipts: { status: string; at: string | null; errors: any }[] }> {
    return (this.api.GET(`${this.R.WA_MESSAGES}/${id}`) as Observable<any>).pipe(map(r => r.data));
  }

  private qs(params: Record<string, string | number | boolean | null | undefined>): string {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
    });
    const s = q.toString();
    return s ? `?${s}` : '';
  }

  // ---- inbox ----

  conversations(params: Record<string, string | number | boolean | null | undefined> = {}): Observable<{ page: WaPage<WaConversation>; counts: { unread: number; open: number; unassigned: number; ads: number } }> {
    return (this.api.GET(this.R.WA_CONVERSATIONS + this.qs(params)) as Observable<any>).pipe(map(r => ({ page: r?.data, counts: r?.meta?.counts ?? { unread: 0, open: 0, unassigned: 0, ads: 0 } })));
  }

  conversationDetails(id: number): Observable<WaConversationDetails> {
    return (this.api.GET(`${this.R.WA_CONVERSATIONS}/${id}/details`) as Observable<any>).pipe(map(r => r.data));
  }

  addNote(id: number, note: string): Observable<WaNote> {
    return (this.api.POST(`${this.R.WA_CONVERSATIONS}/${id}/notes`, { note }) as Observable<any>).pipe(map(r => r.data));
  }

  deleteNote(id: number, noteId: number): Observable<unknown> {
    return this.api.Delete(`${this.R.WA_CONVERSATIONS}/${id}/notes/${noteId}`, {}) as Observable<any>;
  }

  assign(id: number, userId: number | null): Observable<WaConversation> {
    return (this.api.PUT(`${this.R.WA_CONVERSATIONS}/${id}/assign`, { user_id: userId }) as Observable<any>).pipe(map(r => r.data));
  }

  agents(): Observable<{ id: number; name: string }[]> {
    return (this.api.GET('whatsapp/agents') as Observable<any>).pipe(map(r => r?.data ?? []));
  }

  adLeads(params: Record<string, string | number | null | undefined> = {}): Observable<WaAdLeadsReport> {
    return (this.api.GET('whatsapp/ad-leads' + this.qs(params)) as Observable<any>).pipe(map(r => r.data));
  }

  conversationMessages(id: number, params: { before_id?: number; after_id?: number; limit?: number } = {}): Observable<{ messages: WaMessage[]; conversation: WaConversation }> {
    return (this.api.GET(`${this.R.WA_CONVERSATIONS}/${id}/messages` + this.qs(params as any)) as Observable<any>).pipe(map(r => ({ messages: r?.data ?? [], conversation: r?.meta?.conversation })));
  }

  sendInConversation(id: number, body: any): Observable<{ success: boolean; message?: string; data: WaMessage }> {
    return this.api.POST(`${this.R.WA_CONVERSATIONS}/${id}/messages`, body) as Observable<any>;
  }

  markRead(id: number): Observable<unknown> {
    return this.api.POST(`${this.R.WA_CONVERSATIONS}/${id}/read`, {}) as Observable<any>;
  }

  setConversationStatus(id: number, status: string): Observable<{ data: WaConversation }> {
    return this.api.PUT(`${this.R.WA_CONVERSATIONS}/${id}/status`, { status }) as Observable<any>;
  }

  /** Media of a message as a Blob (the API proxies Meta and keeps a copy). */
  mediaBlob(messageId: number): Observable<Blob> {
    return this.api.GET_BLOB(`${this.R.WA_MESSAGES}/${messageId}/media`) as Observable<Blob>;
  }

  // ---- template flows ----

  flows(accountId: number | null = null): Observable<WaFlow[]> {
    return (this.api.GET(this.R.WA_FLOWS + this.qs({ account_id: accountId })) as Observable<any>).pipe(map(r => r?.data ?? []));
  }

  flow(id: number): Observable<WaFlow> {
    return (this.api.GET(`${this.R.WA_FLOWS}/${id}`) as Observable<any>).pipe(map(r => r.data));
  }

  saveFlow(id: number | null, body: any): Observable<{ message: string; data: WaFlow }> {
    return (id ? this.api.PUT(`${this.R.WA_FLOWS}/${id}`, body) : this.api.POST(this.R.WA_FLOWS, body)) as Observable<any>;
  }

  toggleFlow(id: number, isActive: boolean): Observable<{ message: string; data: WaFlow }> {
    return this.api.POST(`${this.R.WA_FLOWS}/${id}/toggle`, { is_active: isActive }) as Observable<any>;
  }

  deleteFlow(id: number): Observable<{ message: string }> {
    return this.api.Delete(`${this.R.WA_FLOWS}/${id}`, {}) as Observable<any>;
  }

  // ---- numbers ----

  phoneNumbers(params: { account_id?: number | null; search?: string } = {}): Observable<WaPhoneNumber[]> {
    const q = new URLSearchParams();
    if (params.account_id) q.set('account_id', String(params.account_id));
    if (params.search) q.set('search', params.search);
    const qs = q.toString();
    return (this.api.GET(this.R.WA_PHONE_NUMBERS + (qs ? `?${qs}` : '')) as Observable<any>).pipe(map(r => r?.data ?? []));
  }

  updatePhoneNumber(id: number, body: { enabled?: boolean; branch_type?: string | null; branch_id?: number | null }): Observable<{ message: string; data: WaPhoneNumber }> {
    return this.api.PUT(`${this.R.WA_PHONE_NUMBERS}/${id}`, body) as Observable<any>;
  }

  makeDefault(id: number): Observable<{ message: string; data: WaPhoneNumber }> {
    return this.api.POST(`${this.R.WA_PHONE_NUMBERS}/${id}/default`, {}) as Observable<any>;
  }
}
