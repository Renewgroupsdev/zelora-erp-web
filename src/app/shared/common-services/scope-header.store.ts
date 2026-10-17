import { Injectable } from '@angular/core';

/**
 * The X-Scope-* headers the auth interceptor adds to API calls. BranchContextService plugs its reader in at app start;
 * this store has no dependency so the interceptor can read it while AuthService itself is still being created (no DI
 * cycle). Until the reader is plugged in nothing is sent (= "All", which only the sign-in / profile calls see).
 */
@Injectable({ providedIn: 'root' })
export class ScopeHeaderStore {
  reader: (() => Record<string, string> | null) | null = null;

  headers(): Record<string, string> | null {
    return this.reader?.() ?? null;
  }
}
