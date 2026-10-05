import { CommonModule } from '@angular/common';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Component, DestroyRef, ElementRef, HostListener, TemplateRef, ViewContainerRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BranchChatService, ChatMessage } from '../../common-services/branch-chat.service';
import { initials } from '../../utils/format.util';

type Tab = 'chat' | 'posts' | 'members';

/**
 * Top-navbar button + slide-in drawer for the signed-in user's own branch group.
 * The drawer is rendered through a CDK overlay (attached to <body>): the navbar uses
 * `backdrop-filter`, which would otherwise trap a `position: fixed` drawer inside the header.
 */
@Component({
  selector: 'app-branch-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './branch-chat.html',
  styleUrl: './branch-chat.scss',
})
export class BranchChat {
  readonly chat = inject(BranchChatService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly drawerTpl = viewChild.required<TemplateRef<unknown>>('drawerTpl');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private overlayRef: OverlayRef | null = null;

  readonly open = signal(false);
  readonly tab = signal<Tab>('chat');
  readonly initials = initials;

  draft = '';
  postDraft = '';
  pinPost = false;
  readonly commentDrafts: Record<string, string> = {};
  readonly openComments = signal<string | null>(null);
  /** Snapshot of "last seen" when the chat was opened, so the divider doesn't jump while reading. */
  readonly dividerAt = signal('');

  readonly onlineCount = computed(() => this.chat.members().filter(m => m.online).length);

  constructor() {
    // Keep the conversation scrolled to the newest message.
    effect(() => {
      this.chat.messages();
      if (this.open() && this.tab() === 'chat') setTimeout(() => this.scrollToBottom(), 0);
    });
    inject(DestroyRef).onDestroy(() => this.overlayRef?.dispose());
  }

  toggle(): void {
    this.open() ? this.close() : this.show(this.chat.unreadChat() || !this.chat.unreadPosts() ? 'chat' : 'posts');
  }

  show(tab: Tab): void {
    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        hasBackdrop: true,
        backdropClass: 'cdk-overlay-dark-backdrop',
        panelClass: 'branch-chat-pane',
        width: 'min(400px, 100vw)',
        height: '100vh',
        positionStrategy: this.overlay.position().global().top('0').right('0'),
        scrollStrategy: this.overlay.scrollStrategies.block(),
      });
      this.overlayRef.backdropClick().subscribe(() => this.close());
    }
    if (!this.overlayRef.hasAttached()) this.overlayRef.attach(new TemplatePortal(this.drawerTpl(), this.vcr));
    this.open.set(true);
    this.setTab(tab);
  }

  close(): void {
    this.overlayRef?.detach();
    this.open.set(false);
    this.chat.viewing.set(null);
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'chat') this.dividerAt.set(this.chat.lastSeenChat());
    this.chat.viewing.set(tab === 'members' ? null : tab);
    if (tab !== 'members') this.chat.markSeen(tab);
    if (tab === 'chat') setTimeout(() => this.scrollToBottom(), 0);
  }

  switchBranch(branch: string): void {
    this.chat.activeBranch.set(branch);
    this.setTab(this.tab());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }

  send(): void {
    if (!this.draft.trim()) return;
    this.chat.send(this.draft);
    this.draft = '';
  }

  onComposerKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  publish(): void {
    if (!this.postDraft.trim()) return;
    this.chat.createPost(this.postDraft, this.pinPost);
    this.postDraft = '';
    this.pinPost = false;
  }

  addComment(postId: string): void {
    this.chat.comment(postId, this.commentDrafts[postId] ?? '');
    this.commentDrafts[postId] = '';
  }

  isMine(m: { senderKey?: string; authorKey?: string }): boolean {
    return (m.senderKey ?? m.authorKey) === this.chat.myKey();
  }

  /** Date separator shown before the first message of each day. */
  dayLabel(list: ChatMessage[], i: number): string | null {
    const day = list[i].at.slice(0, 10);
    if (i > 0 && list[i - 1].at.slice(0, 10) === day) return null;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return day === today ? 'Today' : day === yesterday ? 'Yesterday' : new Date(list[i].at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Index of the first message that arrived after the user last opened the chat. */
  firstUnreadIndex(list: ChatMessage[]): number {
    const seen = this.dividerAt();
    if (!seen) return -1;
    return list.findIndex(m => m.at > seen && !this.isMine(m));
  }

  /** Consecutive messages from the same sender are grouped (name shown once). */
  showSender(list: ChatMessage[], i: number): boolean {
    return i === 0 || list[i - 1].senderKey !== list[i].senderKey || !!this.dayLabel(list, i);
  }

  private scrollToBottom(): void {
    const el = this.scroller()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
