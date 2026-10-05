import { Injectable, NgZone, computed, inject, signal } from '@angular/core';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/auth/auth.service';
import { isAdmin, isTelecallerRole } from '../../core/auth/auth.model';
import { Employee } from '../models/hr.model';
import { BRANCHES, uid } from '../utils/format.util';
import { HrService } from './hr.service';
import { NotificationService } from './notification.service';

const STORAGE_KEY = 'zelora_branch_chat_v1';

export interface ChatMessage {
  id: string;
  branch: string;
  senderKey: string;
  senderName: string;
  senderRole: string;
  isHead: boolean;
  text: string;
  at: string;
}

export interface PostComment {
  senderKey: string;
  name: string;
  text: string;
  at: string;
}

export interface BranchPost {
  id: string;
  branch: string;
  authorKey: string;
  authorName: string;
  authorRole: string;
  isHead: boolean;
  body: string;
  at: string;
  pinned: boolean;
  likes: string[];
  comments: PostComment[];
}

export interface ChatMember {
  key: string;
  name: string;
  role: string;
  isHead: boolean;
  online: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  posts: BranchPost[];
  /** `${userKey}|${branch}|chat` / `...|posts` -> ISO time last seen. */
  lastSeen: Record<string, string>;
}

/** Branch heads / managers: by HR designation, else by login role. */
const isHeadDesignation = (designation: string) => /head|manager/i.test(designation);

/**
 * Branch group chat + post board. Every message and post is stamped with ONE branch, and every read
 * goes through `myBranches()`, so an employee only ever sees their own branch group - other branches'
 * staff and heads are never listed or readable. Design stage: state is in localStorage (synced across
 * tabs); the backend must enforce the same rule by filtering on the user's branch (org unit).
 */
@Injectable({ providedIn: 'root' })
export class BranchChatService {
  private readonly auth = inject(AuthService);
  private readonly hr = inject(HrService);
  private readonly notifications = inject(NotificationService);
  private readonly zone = inject(NgZone);

  private readonly state = signal<ChatState>(this.load());
  /** True while the chat drawer is open on the chat tab of `activeBranch` - suppresses popups. */
  readonly viewing = signal<'chat' | 'posts' | null>(null);

  /** The HR employee record for the signed-in user (matched by email, then name). */
  readonly me = computed<Employee | undefined>(() => {
    const u = this.auth.currentUser();
    if (!u) return undefined;
    const list = this.hr.employees().filter(e => e.status !== 'Exited');
    return list.find(e => e.email && e.email.toLowerCase() === u.email?.toLowerCase()) ?? list.find(e => e.name.toLowerCase() === u.name?.toLowerCase());
  });

  readonly myKey = computed(() => (this.me() ? this.me()!.id : `user-${this.auth.currentUser()?.id ?? 'guest'}`));
  readonly myName = computed(() => this.me()?.name ?? this.auth.currentUser()?.name ?? 'You');
  readonly isAdminUser = computed(() => isAdmin(this.auth.currentUser()?.role_id));
  readonly amHead = computed(() => (this.me() ? isHeadDesignation(this.me()!.designation) : !isTelecallerRole(this.auth.currentUser())));
  readonly myRole = computed(() => this.me()?.designation ?? (this.isAdminUser() ? 'Administrator' : this.amHead() ? 'Branch Head' : 'Staff'));

  /**
   * Branch groups this user may open. Employees: only their own branch.
   * Administrators (head office) may switch between branch groups to moderate.
   */
  readonly myBranches = computed<string[]>(() => {
    if (this.isAdminUser() && !this.me()) return BRANCHES;
    return [this.me()?.branch ?? BRANCHES[0]];
  });

  readonly activeBranch = signal<string>('');
  readonly branch = computed(() => (this.myBranches().includes(this.activeBranch()) ? this.activeBranch() : this.myBranches()[0]));

  readonly messages = computed(() => this.state().messages.filter(m => m.branch === this.branch()).sort((a, b) => a.at.localeCompare(b.at)));
  readonly posts = computed(() => this.state().posts
    .filter(p => p.branch === this.branch())
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at)));

  readonly members = computed<ChatMember[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const list = this.hr.employees()
      .filter(e => e.branch === this.branch() && e.status !== 'Exited')
      .map(e => {
        const punch = this.hr.attendance().find(a => a.empId === e.id && a.date === today);
        return { key: e.id, name: e.name, role: e.designation, isHead: isHeadDesignation(e.designation), online: !!punch?.checkIn && !punch.checkOut };
      });
    if (!list.some(m => m.key === this.myKey()) && this.myBranches().includes(this.branch())) {
      list.unshift({ key: this.myKey(), name: this.myName(), role: this.myRole(), isHead: this.amHead(), online: true });
    }
    return list.sort((a, b) => Number(b.isHead) - Number(a.isHead) || a.name.localeCompare(b.name));
  });

  readonly unreadChat = computed(() => this.unreadIn('chat'));
  readonly unreadPosts = computed(() => this.unreadIn('posts'));
  readonly unreadTotal = computed(() => this.myBranches().reduce((s, b) => s + this.unreadFor(b, 'chat') + this.unreadFor(b, 'posts'), 0));

  constructor() {
    // Another tab (another signed-in user on this machine) wrote to the store: pick it up live.
    window.addEventListener('storage', e => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      this.zone.run(() => {
        const before = new Set(this.state().messages.map(m => m.id));
        this.state.set(this.load());
        this.state().messages.filter(m => !before.has(m.id)).forEach(m => this.announce(m));
      });
    });
  }

  private unreadIn(kind: 'chat' | 'posts'): number {
    return this.unreadFor(this.branch(), kind);
  }

  private unreadFor(branch: string, kind: 'chat' | 'posts'): number {
    const seen = this.state().lastSeen[`${this.myKey()}|${branch}|${kind}`] ?? '';
    const list = kind === 'chat'
      ? this.state().messages.filter(m => m.branch === branch && m.senderKey !== this.myKey())
      : this.state().posts.filter(p => p.branch === branch && p.authorKey !== this.myKey());
    return list.filter(x => x.at > seen).length;
  }

  markSeen(kind: 'chat' | 'posts'): void {
    const key = `${this.myKey()}|${this.branch()}|${kind}`;
    this.patch({ lastSeen: { ...this.state().lastSeen, [key]: new Date().toISOString() } });
  }

  /** Last time I opened this branch's chat - for the "new messages" divider. */
  lastSeenChat(): string {
    return this.state().lastSeen[`${this.myKey()}|${this.branch()}|chat`] ?? '';
  }

  private assertMember(): boolean {
    // Never allow writing into a branch group the user doesn't belong to.
    return this.myBranches().includes(this.branch());
  }

  send(text: string): void {
    const body = text.trim();
    if (!body || !this.assertMember()) return;
    const msg: ChatMessage = {
      id: uid('MSG'), branch: this.branch(), senderKey: this.myKey(), senderName: this.myName(), senderRole: this.myRole(),
      isHead: this.amHead(), text: body.slice(0, 1000), at: new Date().toISOString(),
    };
    this.patch({ messages: [...this.state().messages, msg] });
    this.markSeen('chat');
    this.simulateReply(msg.branch);
  }

  createPost(body: string, pinned: boolean): void {
    const text = body.trim();
    if (!text || !this.assertMember()) return;
    const post: BranchPost = {
      id: uid('PST'), branch: this.branch(), authorKey: this.myKey(), authorName: this.myName(), authorRole: this.myRole(),
      isHead: this.amHead(), body: text.slice(0, 2000), at: new Date().toISOString(), pinned: pinned && this.amHead(), likes: [], comments: [],
    };
    this.patch({ posts: [post, ...this.state().posts] });
    this.markSeen('posts');
  }

  toggleLike(postId: string): void {
    const me = this.myKey();
    this.updatePost(postId, p => ({ ...p, likes: p.likes.includes(me) ? p.likes.filter(k => k !== me) : [...p.likes, me] }));
  }

  comment(postId: string, text: string): void {
    const body = text.trim();
    if (!body) return;
    this.updatePost(postId, p => ({ ...p, comments: [...p.comments, { senderKey: this.myKey(), name: this.myName(), text: body.slice(0, 500), at: new Date().toISOString() }] }));
  }

  togglePin(postId: string): void {
    if (this.amHead()) this.updatePost(postId, p => ({ ...p, pinned: !p.pinned }));
  }

  deletePost(postId: string): void {
    this.patch({ posts: this.state().posts.filter(p => !(p.id === postId && (p.authorKey === this.myKey() || this.amHead()))) });
  }

  private updatePost(id: string, fn: (p: BranchPost) => BranchPost): void {
    this.patch({ posts: this.state().posts.map(p => (p.id === id && p.branch === this.branch() ? fn(p) : p)) });
  }

  /**
   * Design demo: a colleague from the SAME branch answers a few seconds later, so the new-message
   * badge, bell notification and popup can be seen. Remove once messages arrive over a socket.
   */
  private simulateReply(branch: string): void {
    const colleagues = this.hr.employees().filter(e => e.branch === branch && e.status !== 'Exited' && e.id !== this.myKey());
    if (!colleagues.length) return;
    const who = colleagues[Math.floor(Math.random() * colleagues.length)];
    const replies = ['Noted 👍', 'Okay, will do.', 'Sure, on it.', 'Thanks for the update!', 'Done ✅', 'Will check and confirm.'];
    setTimeout(() => this.zone.run(() => {
      const msg: ChatMessage = {
        id: uid('MSG'), branch, senderKey: who.id, senderName: who.name, senderRole: who.designation,
        isHead: isHeadDesignation(who.designation), text: replies[Math.floor(Math.random() * replies.length)], at: new Date().toISOString(),
      };
      this.patch({ messages: [...this.state().messages, msg] });
      this.announce(msg);
    }), 5000 + Math.random() * 4000);
  }

  /** New-message alert: bell notification + popup, unless the user is reading that chat right now. */
  private announce(m: ChatMessage): void {
    if (m.senderKey === this.myKey() || !this.myBranches().includes(m.branch)) return;
    if (this.viewing() === 'chat' && this.branch() === m.branch && document.visibilityState === 'visible') {
      this.markSeen('chat');
      return;
    }
    this.notifications.add({ type: 'chat', title: `${m.branch} group · ${m.senderName}`, message: m.text });
    Swal.fire({
      toast: true, position: 'top-end', showConfirmButton: false, timer: 4000, timerProgressBar: true,
      iconHtml: '<i class="bi bi-chat-dots-fill"></i>', customClass: { icon: 'border-0' },
      title: `${m.senderName} · ${m.branch}`, text: m.text,
    });
  }

  private patch(partial: Partial<ChatState>): void {
    this.state.update(s => ({ ...s, ...partial }));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state())); } catch { /* storage blocked */ }
  }

  private load(): ChatState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as ChatState;
    } catch { /* fall through */ }
    return seedChat();
  }
}

function seedChat(): ChatState {
  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const msg = (branch: string, senderKey: string, senderName: string, senderRole: string, text: string, min: number): ChatMessage =>
    ({ id: uid('MSG'), branch, senderKey, senderName, senderRole, isHead: isHeadDesignation(senderRole), text, at: ago(min) });
  const post = (branch: string, authorKey: string, authorName: string, authorRole: string, body: string, min: number, pinned = false, likes: string[] = []): BranchPost =>
    ({ id: uid('PST'), branch, authorKey, authorName, authorRole, isHead: isHeadDesignation(authorRole), body, at: ago(min), pinned, likes, comments: [] });

  // Keys match the HR seed employees (EMP-seed-N) so members and senders line up.
  return {
    lastSeen: {},
    messages: [
      msg('Anna Nagar', 'EMP-seed-1', 'Anitha Mohan', 'Branch Head', 'Good morning team! 12 appointments today, 3 PRP sessions back-to-back from 11 AM.', 190),
      msg('Anna Nagar', 'EMP-seed-3', 'Karthik Raman', 'Hair Transplant Technician', 'PRP kits are ready. Need one more centrifuge tube box from store.', 175),
      msg('Anna Nagar', 'EMP-seed-6', 'Sneha Krishnan', 'Accounts Executive', 'Yesterday\'s day book is closed. Collection ₹33,926 👍', 120),
      msg('Anna Nagar', 'EMP-seed-1', 'Anitha Mohan', 'Branch Head', 'Great. Please follow up the 2 pending bills before 5 PM.', 20),
      msg('Velachery', 'EMP-seed-2', 'Dr. Priya Sharma', 'Senior Dermatologist', 'Laser room AC service at 3 PM - shift the 3:30 slot to room 2.', 95),
      msg('Velachery', 'EMP-seed-5', 'Rahul Nair', 'Tele Caller', 'Informed both customers, they are fine with room 2.', 80),
      msg('T. Nagar', 'EMP-seed-4', 'Meena Iyer', 'Front Office Executive', 'Walk-ins are high today, keep the waiting area tidy please.', 60),
      msg('Adyar', 'EMP-seed-7', 'Vignesh Kumar', 'Sales Counsellor', 'Closed the anti-hair-fall package for Mr. Ravi 🎉', 45),
      msg('Adyar', 'EMP-seed-9', 'Suresh Reddy', 'Skin Therapist', 'Congrats! I\'ll schedule his first sitting tomorrow.', 40),
    ],
    posts: [
      post('Anna Nagar', 'EMP-seed-1', 'Anitha Mohan', 'Branch Head', '📌 Branch timings for Diwali week: 9 AM - 6 PM. Sunday closed. Please plan your leave with HR before Friday.', 600, true, ['EMP-seed-3']),
      post('Anna Nagar', 'EMP-seed-8', 'Lakshmi Pillai', 'HR Executive', 'Payslips for last month are available in HR → Payroll. Reach out for any corrections.', 300),
      post('Velachery', 'EMP-seed-2', 'Dr. Priya Sharma', 'Senior Dermatologist', 'New laser protocol sheet is pinned at the reception. Read it before Monday.', 400, true),
      post('Adyar', 'EMP-seed-7', 'Vignesh Kumar', 'Sales Counsellor', 'Target update: 8 / 12 packages done this month. Let\'s push! 💪', 200),
    ],
  };
}
