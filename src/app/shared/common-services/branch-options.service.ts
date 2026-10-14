import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from './api-route-constants';

/** One entry of a "Select branch" dropdown. The id is the organization unit id the other modules store. */
export interface BranchOption {
  id: number;
  name: string;
  code: string;
}

/**
 * Options of every "Select branch" dropdown, from GET /branches/options (active branches). Loaded once and shared;
 * Branch Management calls `refresh()` after a branch is added / edited / deleted. Kept free of other services so any
 * service (HR, accounts, targets, ...) can inject it without a circular dependency.
 */
@Injectable({ providedIn: 'root' })
export class BranchOptionsService {
  private readonly api = inject(ApiDataService);

  private readonly list = signal<BranchOption[]>([]);
  private request$: Observable<BranchOption[]> | null = null;
  readonly options = computed(() => this.list());
  readonly names = computed(() => this.list().map(o => o.name));
  /**
   * Branch names as one array that is refilled in place on every load. For filter configs and services that keep a
   * reference to the list (e.g. `options: hr.branches`); computed()s should read the `names` signal instead.
   */
  readonly nameList: string[] = [];

  /** The first call fetches, later calls reuse it; `force` re-reads. A failed request is retried by the next call. */
  load(force = false): Observable<BranchOption[]> {
    if (!this.request$ || force) {
      this.request$ = (this.api.GET(ApiRoutesConstants.BRANCH_OPTIONS) as Observable<any>).pipe(
        map(res => ((res?.data ?? []) as any[]).map(r => ({ id: Number(r.id), name: r.name, code: r.code ?? '' }) as BranchOption)),
        tap(rows => {
          this.list.set(rows);
          this.nameList.splice(0, this.nameList.length, ...rows.map(o => o.name));
        }),
        catchError(() => { this.request$ = null; return of(this.list()); }),
        shareReplay(1),
      );
    }
    return this.request$;
  }

  /** Fire-and-forget load for screens that read the `options` / `names` signals. */
  ensure(): void {
    this.load().subscribe();
  }

  refresh(): void {
    this.load(true).subscribe();
  }

  idByName(name: string): number | null {
    return this.list().find(o => o.name === name)?.id ?? null;
  }

  nameById(id: number | null | undefined): string {
    return this.list().find(o => o.id === Number(id))?.name ?? '';
  }
}
