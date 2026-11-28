import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, interval } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { templatePreview } from '../templates/wa-templates';
import { WaPreviewModel, WaTemplatePreview } from '../templates/wa-template-preview';
import { WhatsAppApiService } from '../whatsapp-api.service';
import { WhatsAppContextService } from '../whatsapp-context.service';
import { WaConversation, WaConversationDetails, WaMessage, WaTemplate } from '../whatsapp.models';
import { WaEmojiPicker } from './wa-emoji-picker';

type Filter = 'all' | 'unread' | 'open' | 'pending' | 'resolved' | 'mine' | 'unassigned' | 'ads' | 'facebook' | 'instagram' | 'organic';

/** A file waiting in the send preview (WhatsApp's "add a caption" screen). */
interface PendingFile { file: File; url: string | null; kind: 'image' | 'video' | 'audio' | 'document'; caption: string; }

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MAX_MB: Record<string, number> = { image: 5, video: 16, audio: 16, document: 100 };

/**
 * Customer Inbox, built like WhatsApp Web: chats on the left, the conversation in the middle, contact info on the right.
 * Text, emoji, photos / videos / documents with captions (attach, drag & drop, paste), reactions, replies, message info,
 * search in chat, photo viewer, and approved templates when the 24-hour reply window is closed.
 * New messages arrive by polling (every few seconds) until the live socket channel is switched on.
 */
@Component({
  selector: 'app-wa-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, WaTemplatePreview, WaEmojiPicker],
  templateUrl: './wa-inbox.html',
  styleUrl: './wa-inbox.scss',
})
export class WaInbox implements OnInit, OnDestroy {
  private readonly api = inject(WhatsAppApiService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly ctx = inject(WhatsAppContextService);

  @ViewChild('thread') thread?: ElementRef<HTMLDivElement>;
  @ViewChild('composer') composer?: ElementRef<HTMLTextAreaElement>;

  readonly quickReactions = QUICK_REACTIONS;

  // chat list
  readonly conversations = signal<WaConversation[]>([]);
  readonly counts = signal({ unread: 0, open: 0, unassigned: 0, ads: 0 });
  readonly moreFilters = signal(false);

  // contact info panel
  readonly details = signal<WaConversationDetails | null>(null);
  readonly agents = signal<{ id: number; name: string }[]>([]);
  noteText = '';
  readonly canAssign = computed(() => this.auth.hasActionAccess('assign-whatsapp-conversations'));
  readonly listLoading = signal(true);
  readonly filter = signal<Filter>('all');
  readonly search = signal('');
  private readonly search$ = new Subject<string>();

  // conversation
  readonly activeId = signal<number | null>(null);
  readonly active = signal<WaConversation | null>(null);
  readonly messages = signal<WaMessage[]>([]);
  readonly threadLoading = signal(false);
  readonly olderLoading = signal(false);
  readonly noOlder = signal(false);
  readonly sending = signal(false);
  readonly showDetails = signal(false);
  readonly now = signal(Date.now());
  readonly atBottom = signal(true);
  readonly newBelow = signal(0);
  text = '';
  replyTo: WaMessage | null = null;

  // pop-ups
  readonly emojiOpen = signal(false);
  readonly attachOpen = signal(false);
  readonly menuFor = signal<number | null>(null);
  readonly reactFor = signal<number | null>(null);
  readonly infoFor = signal<WaMessage | null>(null);
  readonly lightbox = signal<WaMessage | null>(null);
  readonly dragging = signal(false);

  // search in chat
  readonly chatSearchOpen = signal(false);
  readonly chatQuery = signal('');
  readonly matchIndex = signal(0);

  // media
  readonly uploading = signal(false);
  readonly mediaUrls = signal<Record<number, SafeUrl>>({});
  readonly pending = signal<PendingFile[]>([]);
  readonly pendingIndex = signal(0);
  private objectUrls: string[] = [];

  // template sheet
  readonly templatePanel = signal(false);
  readonly templates = signal<WaTemplate[]>([]);
  readonly templateId = signal<number | null>(null);
  readonly tick = signal(0);
  tValues: { header: { text: string; link: string; media_id: string; filename: string }; body: string[]; buttons: Record<number, string>; code: string } = blankValues();
  confirmOptIn = false;

  private readonly subs = new Subscription();

  readonly canSend = computed(() => this.auth.hasActionAccess('send-whatsapp-messages'));

  /** Reactions are drawn on the message they react to, not as bubbles of their own. */
  readonly visible = computed(() => this.messages().filter(m => m.type !== 'reaction'));

  /** wamid -> reactions shown under it (the latest one of each side; an empty emoji removed it). */
  readonly reactions = computed(() => {
    const latest = new Map<string, Map<string, string>>();
    for (const m of this.messages()) {
      if (m.type !== 'reaction' || !m.context_wamid || m.status === 'failed') continue;
      const bySide = latest.get(m.context_wamid) ?? new Map<string, string>();
      bySide.set(m.direction, m.body ?? '');
      latest.set(m.context_wamid, bySide);
    }
    const out: Record<string, { emoji: string; mine: boolean }[]> = {};
    latest.forEach((bySide, wamid) => {
      const list = [...bySide.entries()].filter(([, e]) => !!e).map(([side, emoji]) => ({ emoji, mine: side === 'outbound' }));
      if (list.length) out[wamid] = list;
    });
    return out;
  });

  readonly matches = computed(() => {
    const q = this.chatQuery().trim().toLowerCase();
    if (!q) return [] as number[];
    return this.visible().filter(m => `${m.body ?? ''} ${m.button_text ?? ''} ${m.media?.filename ?? ''}`.toLowerCase().includes(q)).map(m => m.id);
  });

  readonly template = computed(() => this.templates().find(t => t.id === this.templateId()) ?? null);
  readonly templatePreviewModel = computed<WaPreviewModel | null>(() => {
    this.tick();
    const t = this.template();
    if (!t) return null;
    const base = templatePreview(t, this.active()?.phone_number?.label);
    if (t.category === 'AUTHENTICATION') return base;
    return { ...base, body: base.body.replace(/\{\{(\d+)\}\}/g, (m, n) => this.tValues.body[Number(n) - 1]?.trim() || m) };
  });

  readonly windowLabel = computed(() => {
    const c = this.active();
    this.now();
    if (!c?.window_expires_at) return { open: false, text: 'The customer has not written yet. Start with an approved template.' };
    const ms = new Date(c.window_expires_at).getTime() - Date.now();
    if (ms <= 0) return { open: false, text: 'More than 24 hours since the customer wrote. Only approved templates can be sent.' };
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return { open: true, text: `You can reply freely for ${h}h ${m}m` };
  });

  /** Chips shown like WhatsApp's All / Unread / Favourites; the rest are in the ▾ menu. */
  readonly filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' }, { key: 'ads', label: 'Ad leads' }, { key: 'mine', label: 'Mine' },
  ];
  readonly moreFilterList: { key: Filter; label: string; icon: string }[] = [
    { key: 'facebook', label: 'Facebook ad leads', icon: 'bi-facebook' },
    { key: 'instagram', label: 'Instagram ad leads', icon: 'bi-instagram' },
    { key: 'organic', label: 'Normal WhatsApp chats', icon: 'bi-whatsapp' },
    { key: 'unassigned', label: 'Unassigned', icon: 'bi-person-dash' },
    { key: 'open', label: 'Open', icon: 'bi-circle' },
    { key: 'pending', label: 'Pending', icon: 'bi-hourglass-split' },
    { key: 'resolved', label: 'Resolved', icon: 'bi-check2-circle' },
  ];
  readonly moreActive = computed(() => this.moreFilterList.find(f => f.key === this.filter()) ?? null);

  constructor() {
    effect(() => {
      this.ctx.accountId(); this.ctx.phoneNumberId(); this.filter(); this.search();
      untracked(() => this.loadList());
    });
    // the contact panel's notes / ad details follow the open chat
    effect(() => {
      const id = this.activeId();
      const open = this.showDetails();
      untracked(() => (id && open ? this.loadDetails(id) : this.details.set(null)));
    });
  }

  // ------------------------------------------------------------------ contact info panel

  loadDetails(id: number): void {
    this.api.conversationDetails(id).subscribe({ next: d => { if (this.activeId() === id) this.details.set(d); } });
    if (!this.agents().length && this.canAssign()) this.api.agents().subscribe({ next: a => this.agents.set(a) });
  }

  assignTo(userId: number | null): void {
    const c = this.active();
    if (!c) return;
    this.api.assign(c.id, userId).subscribe({
      next: conv => { this.active.set(conv); this.loadList(true); this.loadDetails(c.id); this.toast.success(userId ? `Assigned to ${conv.assigned_user?.name}` : 'Unassigned'); },
      error: err => this.toast.error('Not assigned', firstError(err)),
    });
  }

  takeChat(): void {
    const me = this.auth.currentUser() as any;
    if (me?.id) this.assignTo(me.id);
  }

  addNote(): void {
    const c = this.active();
    const note = this.noteText.trim();
    if (!c || !note) return;
    this.noteText = '';
    this.api.addNote(c.id, note).subscribe({
      next: n => this.details.update(d => (d ? { ...d, notes: [n, ...d.notes] } : d)),
      error: err => { this.noteText = note; this.toast.error('Note not saved', firstError(err)); },
    });
  }

  deleteNote(id: number): void {
    const c = this.active();
    if (!c) return;
    this.api.deleteNote(c.id, id).subscribe({
      next: () => this.details.update(d => (d ? { ...d, notes: d.notes.filter(n => n.id !== id) } : d)),
      error: err => this.toast.error('Not deleted', firstError(err)),
    });
  }

  /** "Facebook Ad" / "Instagram Ad" / "Meta Ad" / null for a normal WhatsApp chat. */
  sourceLabel(c: { lead_source?: string | null } | null | undefined): string | null {
    switch (c?.lead_source) {
      case 'facebook_ad': return 'Facebook Ad';
      case 'instagram_ad': return 'Instagram Ad';
      case 'ad': return 'Meta Ad';
      default: return null;
    }
  }

  /** The same soft colour for a contact every time (WhatsApp-style default avatars). */
  avatarColor(seed: string | null | undefined): string {
    const palette = ['#25d366', '#00a884', '#53bdeb', '#7f66ff', '#ff8c00', '#e5527f', '#02a698', '#d44f9b', '#5f6ff0', '#c79b00', '#0b8a73', '#a65fe3'];
    let h = 0;
    for (const ch of String(seed ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  }

  initials(name: string | null | undefined): string {
    const clean = String(name ?? '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
    if (!clean || /^\d[\d ]*$/.test(clean)) return '';
    return clean.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  ngOnInit(): void {
    this.ctx.load();
    this.subs.add(this.search$.pipe(debounceTime(300)).subscribe(v => this.search.set(v)));
    this.subs.add(interval(4000).subscribe(() => this.pollThread()));
    this.subs.add(interval(8000).subscribe(() => this.loadList(true)));
    this.subs.add(interval(30000).subscribe(() => this.now.set(Date.now())));

    const id = Number(this.route.snapshot.queryParamMap.get('c'));
    if (id) this.open(id);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.objectUrls.forEach(u => URL.revokeObjectURL(u));
    this.pending().forEach(p => p.url && URL.revokeObjectURL(p.url));
  }

  /** Esc closes the top-most pop-up, like WhatsApp. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.lightbox()) this.lightbox.set(null);
    else if (this.pending().length) this.cancelPending();
    else if (this.infoFor()) this.infoFor.set(null);
    else if (this.emojiOpen() || this.attachOpen() || this.menuFor() !== null || this.reactFor() !== null) this.closePopups();
    else if (this.templatePanel()) this.templatePanel.set(false);
    else if (this.chatSearchOpen()) this.toggleChatSearch();
    else if (this.replyTo) this.replyTo = null;
  }

  closePopups(): void {
    this.emojiOpen.set(false);
    this.attachOpen.set(false);
    this.menuFor.set(null);
    this.reactFor.set(null);
  }

  // ------------------------------------------------------------------ chat list

  onSearch(v: string): void {
    this.search$.next(v);
  }

  loadList(quiet = false): void {
    if (!quiet) this.listLoading.set(true);
    this.api.conversations({
      account_id: this.ctx.accountId(), phone_number_id: this.ctx.phoneNumberId(), filter: this.filter(), search: this.search(), per_page: 60,
    }).subscribe({
      next: r => {
        this.conversations.set(r.page?.data ?? []);
        this.counts.set(r.counts);
        this.listLoading.set(false);
        const a = this.active();
        if (a) {
          const fresh = this.conversations().find(c => c.id === a.id);
          if (fresh) this.active.set({ ...fresh, unread_count: 0 });
        }
      },
      error: () => this.listLoading.set(false),
    });
  }

  // ------------------------------------------------------------------ conversation

  open(id: number): void {
    if (this.activeId() === id) return;
    this.activeId.set(id);
    this.messages.set([]);
    this.replyTo = null;
    this.text = '';
    this.noOlder.set(false);
    this.newBelow.set(0);
    this.templatePanel.set(false);
    this.chatSearchOpen.set(false);
    this.chatQuery.set('');
    this.closePopups();
    this.threadLoading.set(true);
    this.router.navigate([], { queryParams: { c: id }, queryParamsHandling: 'merge', replaceUrl: true });
    this.api.conversationMessages(id).subscribe({
      next: r => {
        this.active.set(r.conversation);
        this.messages.set(r.messages);
        this.noOlder.set(r.messages.length < 60);
        this.threadLoading.set(false);
        this.loadMedia(r.messages);
        this.scrollDown(true);
        if (r.conversation?.unread_count) this.markRead(id);
      },
      error: err => {
        this.threadLoading.set(false);
        this.toast.error('Could not open the chat', err?.error?.message);
      },
    });
  }

  private markRead(id: number): void {
    this.api.markRead(id).subscribe();
    this.conversations.update(list => list.map(c => (c.id === id ? { ...c, unread_count: 0 } : c)));
  }

  private pollThread(): void {
    const id = this.activeId();
    if (!id || this.threadLoading()) return;
    const last = [...this.messages()].reverse().find(m => m.id > 0);
    this.api.conversationMessages(id, last ? { after_id: last.id } : {}).subscribe({
      next: r => {
        if (this.activeId() !== id) return;
        this.active.set(r.conversation);
        const fresh = r.messages;
        if (fresh.length) {
          this.messages.update(list => [
            ...list.filter(m => !fresh.some(f => f.id === m.id || (!!m.client_uid && f.client_uid === m.client_uid))),
            ...fresh,
          ].sort((a, b) => (a.id < 0 ? Number.MAX_SAFE_INTEGER : a.id) - (b.id < 0 ? Number.MAX_SAFE_INTEGER : b.id)));
          this.loadMedia(fresh);
          const incoming = fresh.filter(m => m.direction === 'inbound' && m.type !== 'reaction').length;
          if (this.atBottom()) this.scrollDown();
          else this.newBelow.update(n => n + incoming);
          if (incoming) this.markRead(id);
        }
        this.refreshStatuses(id);
      },
    });
  }

  private refreshStatuses(id: number): void {
    const pending = this.messages().filter(m => m.id > 0 && m.direction === 'outbound' && !['read', 'failed'].includes(m.status)).slice(-15);
    if (!pending.length) return;
    this.api.conversationMessages(id, { after_id: pending[0].id - 1, limit: 100 }).subscribe(r => {
      if (this.activeId() !== id) return;
      const byId = new Map(r.messages.map(m => [m.id, m]));
      this.messages.update(list => list.map(m => byId.get(m.id) ?? m));
    });
  }

  /** Scrolling to the top loads older messages; leaving the bottom shows the jump-down button. */
  onThreadScroll(): void {
    const el = this.thread?.nativeElement;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    this.atBottom.set(bottom);
    if (bottom) this.newBelow.set(0);
    if (el.scrollTop < 80) this.loadOlder();
  }

  loadOlder(): void {
    const id = this.activeId();
    const first = this.messages().find(m => m.id > 0);
    if (!id || !first || this.olderLoading() || this.noOlder()) return;
    const el = this.thread?.nativeElement;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    this.olderLoading.set(true);
    this.api.conversationMessages(id, { before_id: first.id, limit: 50 }).subscribe({
      next: r => {
        this.olderLoading.set(false);
        if (this.activeId() !== id) return;
        if (r.messages.length < 50) this.noOlder.set(true);
        this.messages.update(list => [...r.messages, ...list]);
        this.loadMedia(r.messages);
        // keep the message the user was reading in place
        setTimeout(() => { if (el) el.scrollTop = el.scrollHeight - before; });
      },
      error: () => this.olderLoading.set(false),
    });
  }

  jumpDown(): void {
    this.newBelow.set(0);
    this.scrollDown(true);
  }

  // ------------------------------------------------------------------ composer

  onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      this.sendText();
    }
  }

  autoGrow(): void {
    const ta = this.composer?.nativeElement;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }

  insertEmoji(e: string): void {
    const ta = this.composer?.nativeElement;
    if (!ta || ta.disabled) { this.text += e; return; }
    const s = ta.selectionStart ?? this.text.length;
    const end = ta.selectionEnd ?? this.text.length;
    this.text = this.text.slice(0, s) + e + this.text.slice(end);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + e.length, s + e.length); this.autoGrow(); });
  }

  sendText(): void {
    const c = this.active();
    const text = this.text.trim();
    if (!c || !text || this.sending()) return;
    if (!this.windowLabel().open) {
      this.toast.warning('Reply window closed', 'More than 24 hours since the customer wrote. Send an approved template instead.');
      this.openTemplates();
      return;
    }
    this.text = '';
    this.emojiOpen.set(false);
    setTimeout(() => this.autoGrow());
    this.post(c.id, { type: 'text', text, reply_to: this.replyTo?.wamid ?? null }, { type: 'text', body: text });
  }

  // ------------------------------------------------------------------ files: attach, drag & drop, paste, preview

  pickFiles(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.attachOpen.set(false);
    this.queueFiles(files);
  }

  onDragOver(ev: DragEvent): void {
    if (!this.activeId() || !ev.dataTransfer?.types.includes('Files')) return;
    ev.preventDefault();
    this.dragging.set(true);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragging.set(false);
    this.queueFiles(Array.from(ev.dataTransfer?.files ?? []));
  }

  onPaste(ev: ClipboardEvent): void {
    const files = Array.from(ev.clipboardData?.files ?? []);
    if (files.length) {
      ev.preventDefault();
      this.queueFiles(files);
    }
  }

  private queueFiles(files: File[]): void {
    if (!files.length || !this.active()) return;
    if (!this.windowLabel().open) {
      this.toast.warning('Reply window closed', 'Photos and files can only be sent within 24 hours of the customer\'s last message.');
      return;
    }
    const items: PendingFile[] = [];
    for (const file of files.slice(0, 10)) {
      const kind = kindOf(file.type);
      if (file.size > MAX_MB[kind] * 1024 * 1024) {
        this.toast.warning('File too large', `${file.name}: WhatsApp allows ${kind}s up to ${MAX_MB[kind]} MB.`);
        continue;
      }
      items.push({ file, kind, caption: '', url: kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null });
    }
    if (!items.length) return;
    this.pending.update(list => [...list, ...items]);
    if (this.pending().length === items.length) {
      this.pendingIndex.set(0);
      // the text typed so far becomes the first caption, like WhatsApp
      if (this.text.trim()) { items[0].caption = this.text.trim(); this.text = ''; }
    }
  }

  removePending(i: number): void {
    const p = this.pending()[i];
    if (p?.url) URL.revokeObjectURL(p.url);
    this.pending.update(list => list.filter((_, j) => j !== i));
    this.pendingIndex.set(Math.max(0, Math.min(this.pendingIndex(), this.pending().length - 1)));
  }

  cancelPending(): void {
    this.pending().forEach(p => p.url && URL.revokeObjectURL(p.url));
    this.pending.set([]);
  }

  /** Uploads and sends every file in the preview, in order, each with its own caption. */
  async sendPending(): Promise<void> {
    const c = this.active();
    const items = this.pending();
    if (!c || !items.length) return;
    this.pending.set([]);
    this.uploading.set(true);
    for (const p of items) {
      try {
        const r: any = await new Promise((resolve, reject) => this.api.uploadMedia(c.phone_number_id, p.file).subscribe({ next: resolve, error: reject }));
        const kind = r.data.kind as string;
        this.post(c.id, { type: 'media', media_id: r.data.media_id, media_kind: kind, mime: r.data.mime, filename: r.data.filename, caption: p.caption.trim() || null },
          { type: kind, body: p.caption.trim() || null, media: { mime: r.data.mime, filename: r.data.filename, size: p.file.size, url: null } }, p.url);
      } catch (err: any) {
        this.toast.error('Not sent', `${p.file.name}: ${firstError(err)}`);
        if (p.url) URL.revokeObjectURL(p.url);
      }
    }
    this.uploading.set(false);
  }

  // ------------------------------------------------------------------ message actions

  react(m: WaMessage, emoji: string): void {
    const c = this.active();
    this.closePopups();
    if (!c || !m.wamid) return;
    if (!this.windowLabel().open) {
      this.toast.warning('Reply window closed', 'Reactions can only be sent within 24 hours of the customer\'s last message.');
      return;
    }
    const mine = this.reactions()[m.wamid]?.find(r => r.mine)?.emoji;
    const value = mine === emoji ? '' : emoji; // tapping your own reaction again removes it
    this.post(c.id, { type: 'reaction', reply_to: m.wamid, emoji: value }, { type: 'reaction', body: value || null, context_wamid: m.wamid }, null, false);
  }

  reply(m: WaMessage): void {
    this.closePopups();
    this.replyTo = m;
    setTimeout(() => this.composer?.nativeElement?.focus());
  }

  copy(m: WaMessage): void {
    this.closePopups();
    navigator.clipboard?.writeText(m.body ?? m.button_text ?? '').then(() => this.toast.success('Message copied'), () => undefined);
  }

  openMedia(m: WaMessage): void {
    if (m.type === 'image' || m.type === 'sticker') this.lightbox.set(m);
    else this.download(m);
  }

  // ------------------------------------------------------------------ search in chat

  toggleChatSearch(): void {
    this.chatSearchOpen.update(v => !v);
    if (!this.chatSearchOpen()) this.chatQuery.set('');
    this.matchIndex.set(0);
  }

  onChatQuery(v: string): void {
    this.chatQuery.set(v);
    this.matchIndex.set(Math.max(0, this.matches().length - 1));
    this.scrollToMatch();
  }

  stepMatch(dir: 1 | -1): void {
    const n = this.matches().length;
    if (!n) return;
    this.matchIndex.set((this.matchIndex() + dir + n) % n);
    this.scrollToMatch();
  }

  private scrollToMatch(): void {
    const id = this.matches()[this.matchIndex()];
    if (id) setTimeout(() => document.getElementById(`wa-msg-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  // ------------------------------------------------------------------ sending

  private post(conversationId: number, body: any, optimistic: Partial<WaMessage>, previewUrl?: string | null, scroll = true): void {
    const uid = uuid();
    const temp: WaMessage = {
      id: -Date.now() - Math.floor(Math.random() * 1000), client_uid: uid, conversation_id: conversationId, account_id: 0, phone_number_id: 0, contact_id: 0,
      direction: 'outbound', type: 'text', wamid: null, body: null, content: null, template: null, context_wamid: body.reply_to ?? null, button_text: null,
      button_payload: null, media: null, status: 'pending', error: null, source: 'inbox', timestamp: new Date().toISOString(), sent_at: null,
      delivered_at: null, read_at: null, failed_at: null, created_at: new Date().toISOString(), ...optimistic,
    };
    if (previewUrl) {
      this.objectUrls.push(previewUrl);
      this.mediaUrls.update(m => ({ ...m, [temp.id]: this.sanitizer.bypassSecurityTrustUrl(previewUrl) }));
    }
    this.messages.update(list => [...list, temp]);
    if (body.type !== 'reaction') this.replyTo = null;
    if (scroll) this.scrollDown(true);
    this.sending.set(true);

    this.api.sendInConversation(conversationId, { ...body, client_uid: uid }).subscribe({
      next: r => {
        this.sending.set(false);
        const url = this.mediaUrls()[temp.id];
        if (url) this.mediaUrls.update(m => ({ ...m, [r.data.id]: url }));
        this.messages.update(list => list.map(m => (m.id === temp.id ? r.data : m)));
        this.loadList(true);
      },
      error: err => {
        this.sending.set(false);
        if (err?.error?.data?.id) {
          this.messages.update(list => list.map(m => (m.id === temp.id ? err.error.data : m)));
        } else {
          this.messages.update(list => list.map(m => (m.id === temp.id ? { ...m, status: 'failed', error: { code: '', title: firstError(err), detail: null } } : m)));
        }
        this.toast.error('Not sent', firstError(err));
      },
    });
  }

  // ------------------------------------------------------------------ templates

  openTemplates(): void {
    const c = this.active();
    if (!c) return;
    this.closePopups();
    this.templatePanel.set(true);
    this.api.templates({ account_id: c.account_id, sendable: 1, per_page: 200 }).subscribe({
      next: r => this.templates.set(r.page?.data ?? []),
      error: err => this.toast.error('Could not load templates', firstError(err)),
    });
  }

  pickTemplate(id: number | null): void {
    this.templateId.set(id);
    this.tValues = blankValues();
    const p = this.template()?.parameters;
    if (p) this.tValues.body = Array.from({ length: p.body }, (_, i) => (i === 0 ? this.active()?.contact?.name ?? '' : ''));
    this.confirmOptIn = this.active()?.contact?.opt_in_status === 'opted_in';
    this.tick.update(v => v + 1);
  }

  onTemplateHeaderFile(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    const c = this.active();
    if (!file || !c) return;
    this.uploading.set(true);
    this.api.uploadMedia(c.phone_number_id, file).subscribe({
      next: r => { this.uploading.set(false); this.tValues.header.media_id = r.data.media_id; this.tValues.header.filename = r.data.filename; this.tick.update(v => v + 1); },
      error: err => { this.uploading.set(false); this.toast.error('File not uploaded', firstError(err)); },
    });
  }

  sendTemplate(): void {
    const c = this.active();
    const t = this.template();
    if (!c || !t) return;
    const p = t.parameters;
    const values: any = p.otp ? { code: this.tValues.code } : {
      body: this.tValues.body.slice(0, p.body),
      buttons: this.tValues.buttons,
      header: p.header ? (p.header.type === 'text' ? { text: this.tValues.header.text } : {
        media_id: this.tValues.header.media_id || undefined, link: this.tValues.header.media_id ? undefined : this.tValues.header.link || undefined,
        filename: this.tValues.header.filename || undefined,
      }) : undefined,
    };
    const preview = this.templatePreviewModel();
    this.templatePanel.set(false);
    this.post(c.id, { type: 'template', template_id: t.id, values, confirm_opt_in: this.confirmOptIn }, {
      type: 'template', body: preview?.body ?? t.body, template: { id: t.id, name: t.name, language: t.language },
      content: { buttons: preview?.buttons ?? [], footer: preview?.footer ?? null, header: preview?.header ?? null },
    });
  }

  setStatus(status: string): void {
    const c = this.active();
    if (!c) return;
    this.api.setConversationStatus(c.id, status).subscribe({
      next: r => { this.active.set(r.data); this.loadList(true); },
      error: err => this.toast.error('Not changed', firstError(err)),
    });
  }

  // ------------------------------------------------------------------ view helpers

  private loadMedia(list: WaMessage[]): void {
    for (const m of list) {
      if (!m.media?.url || this.mediaUrls()[m.id] || !['image', 'sticker', 'video', 'audio'].includes(m.type)) continue;
      this.api.mediaBlob(m.id).subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          this.objectUrls.push(url);
          this.mediaUrls.update(x => ({ ...x, [m.id]: this.sanitizer.bypassSecurityTrustUrl(url) }));
        },
      });
    }
  }

  download(m: WaMessage): void {
    this.closePopups();
    this.api.mediaBlob(m.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = m.media?.filename || `whatsapp-${m.id}.${(blob.type.split('/')[1] || 'bin').split(';')[0]}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      error: () => this.toast.error('File not available', 'WhatsApp keeps media for a limited time only.'),
    });
  }

  private scrollDown(force = false): void {
    setTimeout(() => {
      const el = this.thread?.nativeElement;
      if (el && (force || this.atBottom())) {
        el.scrollTop = el.scrollHeight;
        this.atBottom.set(true);
      }
    }, 30);
  }

  dayLabel(m: WaMessage, i: number): string | null {
    const d = new Date(m.timestamp ?? m.created_at ?? Date.now());
    const prev = this.visible()[i - 1];
    if (prev && new Date(prev.timestamp ?? prev.created_at ?? 0).toDateString() === d.toDateString()) return null;
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    const days = (today.getTime() - d.getTime()) / 86_400_000;
    if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  firstOfGroup(m: WaMessage, i: number): boolean {
    const prev = this.visible()[i - 1];
    if (!prev || prev.direction !== m.direction) return true;
    return new Date(prev.timestamp ?? prev.created_at ?? 0).toDateString() !== new Date(m.timestamp ?? m.created_at ?? 0).toDateString();
  }

  senderLabel(m: WaMessage, i: number): string | null {
    if (m.direction !== 'outbound') return null;
    const name = m.source === 'automation' ? 'Automatic reply' : m.sent_by?.name ?? null;
    const prev = this.visible()[i - 1];
    const prevName = prev?.direction === 'outbound' ? (prev.source === 'automation' ? 'Automatic reply' : prev.sent_by?.name ?? null) : undefined;
    return name && (this.firstOfGroup(m, i) || prevName !== name) ? name : null;
  }

  listTime(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
    if (days === 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  timeOnMedia(m: WaMessage): boolean {
    return ['image', 'video', 'sticker'].includes(m.type) && !m.body;
  }

  /** 1-3 emoji and nothing else: shown large, without a bubble background, like WhatsApp. */
  jumbo(m: WaMessage): boolean {
    if (m.type !== 'text' || !m.body) return false;
    const t = m.body.trim();
    return t.length <= 24 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(t) && (t.match(/\p{Extended_Pictographic}/gu)?.length ?? 0) <= 3;
  }

  quoted(m: WaMessage): WaMessage | null {
    return m.context_wamid ? this.messages().find(x => x.wamid === m.context_wamid) ?? null : null;
  }

  tick$(m: WaMessage): { icon: string; cls: string; title: string } {
    switch (m.status) {
      case 'pending': return { icon: 'bi-clock', cls: 'pending', title: 'Sending' };
      case 'accepted': case 'sent': return { icon: 'bi-check2', cls: '', title: 'Sent' };
      case 'delivered': return { icon: 'bi-check2-all', cls: '', title: 'Delivered' };
      case 'read': return { icon: 'bi-check2-all', cls: 'read', title: 'Read' };
      case 'failed': return { icon: 'bi-exclamation-circle-fill', cls: 'failed', title: m.error?.title ?? 'Not sent' };
      default: return { icon: '', cls: '', title: '' };
    }
  }

  isMatch(m: WaMessage): boolean {
    return this.matches().includes(m.id);
  }

  isCurrentMatch(m: WaMessage): boolean {
    return this.matches()[this.matchIndex()] === m.id;
  }

  format(text: string | null | undefined): string {
    let escaped = (text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    escaped = escaped
      .replace(/```([^`]+)```/g, '<code>$1</code>')
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?])/g, '$1<em>$2</em>')
      .replace(/~([^~\n]+)~/g, '<s>$1</s>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    const q = this.chatQuery().trim();
    if (q) {
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')})(?![^<]*>)`, 'gi');
      escaped = escaped.replace(re, '<mark>$1</mark>');
    }
    return escaped.replace(/\n/g, '<br>');
  }

  fileSize(bytes: number | null | undefined): string {
    if (!bytes) return '';
    return bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
  }

  fileExt(name: string | null | undefined): string {
    return (name?.split('.').pop() ?? 'FILE').toUpperCase().slice(0, 4);
  }

  varLabel(n: number): string {
    return `{{${n}}}`;
  }

  touch(): void {
    this.tick.update(v => v + 1);
  }
}

function kindOf(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime === 'image/jpeg' || mime === 'image/png') return 'image';
  if (mime === 'video/mp4' || mime === 'video/3gpp') return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

function blankValues() {
  return { header: { text: '', link: '', media_id: '', filename: '' }, body: [] as string[], buttons: {} as Record<number, string>, code: '' };
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
