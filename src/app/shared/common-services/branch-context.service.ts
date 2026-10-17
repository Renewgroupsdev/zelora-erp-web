import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AuthUser } from '../../core/auth/auth.model';
import { BranchOptionsService } from './branch-options.service';
import { ScopeHeaderStore } from './scope-header.store';

export type ScopeType = 'all' | 'branch' | 'franchise';

export interface ScopeSelection {
  type: ScopeType;
  /** branches.id or franchises.id (per `type`); null = every branch (or franchise) of `type`. */
  id: number | null;
}

const STORAGE_PREFIX = 'zelora_scope_v2_';
const ALL: ScopeSelection = { type: 'all', id: null };

/**
 * The header filter: "All / Branch / Franchise" + which branch / franchise. The auth interceptor sends it on every API
 * call as `X-Scope-Type` / `X-Scope-Id`, and the API returns only that branch's / franchise's data.
 *
 * Who may switch is decided by Roles & Permissions (action `switch-branch-franchise`), sent with the login profile.
 * A login without it is held to its own branch / franchise (users.branch_or_franchise_id) - the API enforces that
 * whatever is sent, so the header only shows it. The choice is remembered per login, never shared between logins.
 * `key` changes with what is in force, so the page outlet re-creates itself and refetches.
 *
 * Created at app start (app.config) so the remembered choice is in force before the first page asks for data.
 */
@Injectable({ providedIn: 'root' })
export class BranchContextService {
  private readonly auth = inject(AuthService);
  private readonly options = inject(BranchOptionsService);

  private readonly picked = signal<ScopeSelection>(ALL);

  /** Staff logins only - customers have no branch filter. */
  readonly enabled = computed(() => isStaff(this.auth.currentUser()));
  readonly canSwitch = computed(() => {
    const user = this.auth.currentUser();
    return !!(user?.scope?.can_switch ?? this.options.scope()?.can_switch);
  });
  /** The login's own branch / franchise (what a login without the permission is held to). */
  readonly ownUnit = computed(() => this.auth.currentUser()?.scope?.unit ?? this.options.scope()?.unit ?? null);

  /** What is in force: the picked filter, or the login's own unit when it may not switch. */
  readonly selection = computed<ScopeSelection>(() => {
    if (this.canSwitch()) return this.picked();
    const own = this.ownUnit();
    return own ? { type: own.type === 'franchise' ? 'franchise' : 'branch', id: own.id } : ALL;
  });

  /** Changes whenever the data in force changes (other filter, permission granted / revoked, other login). */
  readonly key = computed(() => {
    const s = this.selection();
    return `${this.auth.currentUser()?.id ?? '-'}|${this.canSwitch() ? 'switch' : 'own'}|${s.type}|${s.id ?? 'all'}`;
  });

  /** Read-only text for a login that may not switch. */
  readonly ownLabel = computed(() => this.ownUnit()?.name ?? 'No branch assigned');

  /**
   * Headers for the API. Nothing is sent for "All", a customer, or a login held to its own unit (the API applies that
   * unit itself, whatever is sent).
   */
  private readonly headers = computed<Record<string, string> | null>(() => {
    const s = this.picked();
    if (!this.enabled() || !this.canSwitch() || s.type === 'all') return null;
    const headers: Record<string, string> = { 'X-Scope-Type': s.type };
    if (s.id !== null) headers['X-Scope-Id'] = String(s.id);
    return headers;
  });

  private userKey: string | null = null;

  constructor() {
    inject(ScopeHeaderStore).reader = () => this.headers();

    // Sign-in / sign-out / another login on this browser: start from that login's own remembered choice. Run once
    // right away (page reload with a session) and again whenever the signed-in account changes.
    this.syncUser(this.auth.currentUser());
    effect(() => {
      const user = this.auth.currentUser();
      untracked(() => this.syncUser(user));
    });

    // A remembered branch / franchise that was deleted, deactivated or is no longer offered falls back to its "All".
    effect(() => {
      const s = this.picked();
      const list = this.options.options();
      const loaded = this.options.scope() !== null;
      if (s.id === null || !loaded) return;
      if (!list.some(o => o.id === s.id && o.type === s.type)) {
        untracked(() => this.apply({ type: s.type, id: null }));
      }
    });
  }

  setType(type: ScopeType): void {
    if (type === this.picked().type) return;
    this.apply({ type, id: null });
  }

  setUnit(id: number | null): void {
    const s = this.picked();
    if (s.type === 'all' || id === s.id) return;
    this.apply({ type: s.type, id });
  }

  private syncUser(user: AuthUser | null): void {
    const key = user && isStaff(user) ? `${user.login_type ?? 'user'}_${user.id}` : null;
    if (key === this.userKey) return;

    this.userKey = key;
    this.options.reset();
    this.picked.set(key ? this.restore(key) : ALL);
    if (key) this.options.ensure();
  }

  private apply(next: ScopeSelection): void {
    if (!this.canSwitch()) return;
    this.picked.set(next);
    if (this.userKey) {
      try {
        localStorage.setItem(STORAGE_PREFIX + this.userKey, JSON.stringify(next));
      } catch { /* storage blocked - the choice just isn't remembered */ }
    }
  }

  private restore(key: string): ScopeSelection {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) ?? 'null');
      const type: ScopeType = raw?.type === 'branch' || raw?.type === 'franchise' ? raw.type : 'all';
      const id = Number(raw?.id);
      return { type, id: type !== 'all' && Number.isInteger(id) && id > 0 ? id : null };
    } catch {
      return ALL;
    }
  }
}

function isStaff(user: AuthUser | null): boolean {
  return !!user && user.login_type !== 'customer';
}
