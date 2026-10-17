import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { AuthScope, UnitType } from '../../core/auth/auth.model';
import { ApiRoutesConstants } from './api-route-constants';

/**
 * One entry of a "Select branch / franchise" dropdown. Records point at a branch or franchise with a type + id pair
 * (customers.branch_type / branch_id, hr_employees.branch_or_franchise_type / _id, ...): `id` is branches.id or
 * franchises.id and only means something together with `type`. Use `key` ("branch:9" / "franchise:7") as the value
 * of a dropdown that offers both. A franchise's name ends in "(Franchise)" - the same name the API shows on records.
 */
export interface BranchOption {
  id: number;
  type: UnitType;
  /** "branch:9" | "franchise:7" - unique across both types. */
  key: string;
  name: string;
  /** Name without the "(Franchise)" suffix. */
  shortName: string;
  code: string;
}

export function unitKey(type: string | null | undefined, id: number | string | null | undefined): string {
  return (type === 'branch' || type === 'franchise') && Number(id) > 0 ? `${type}:${Number(id)}` : '';
}

export function parseUnitKey(key: string | null | undefined): { type: UnitType; id: number } | null {
  const [type, id] = String(key ?? '').split(':');
  return (type === 'branch' || type === 'franchise') && Number(id) > 0 ? { type, id: Number(id) } : null;
}

/**
 * Options of every "Select branch / franchise" dropdown and of the header filter, from GET /scope/options (active
 * branches + franchises). A login without the header filter permission only gets its own branch / franchise, so its
 * forms cannot offer another one. Loaded once per login and shared; Branch / Franchise Management call `refresh()`
 * after an add / edit / delete. Kept free of other services so any service can inject it without a circular dependency.
 */
@Injectable({ providedIn: 'root' })
export class BranchOptionsService {
  private readonly api = inject(ApiDataService);

  private readonly list = signal<BranchOption[]>([]);
  private readonly scopeInfo = signal<AuthScope | null>(null);
  private request$: Observable<BranchOption[]> | null = null;

  /** Branches first, then franchises. */
  readonly options = computed(() => this.list());
  readonly branches = computed(() => this.list().filter(o => o.type === 'branch'));
  readonly franchises = computed(() => this.list().filter(o => o.type === 'franchise'));
  readonly names = computed(() => this.list().map(o => o.name));
  /** As sent with the options; the login profile (AuthUser.scope) is the primary source. */
  readonly scope = this.scopeInfo.asReadonly();
  /**
   * Option names as one array that is refilled in place on every load. For filter configs and services that keep a
   * reference to the list (e.g. `options: hr.branches`); computed()s should read the `names` signal instead.
   */
  readonly nameList: string[] = [];

  /** The first call fetches, later calls reuse it; `force` re-reads. A failed request is retried by the next call. */
  load(force = false): Observable<BranchOption[]> {
    if (!this.request$ || force) {
      this.request$ = (this.api.GET(ApiRoutesConstants.SCOPE_OPTIONS) as Observable<any>).pipe(
        map(res => {
          const data = res?.data ?? {};
          this.scopeInfo.set({ can_switch: !!data.can_switch, unit: data.unit ?? null });
          return [...toOptions(data.branches, 'branch'), ...toOptions(data.franchises, 'franchise')];
        }),
        tap(rows => this.apply(rows)),
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

  /** Forget the list (sign-out / another login) - the next `load()` fetches the new login's options. */
  reset(): void {
    this.request$ = null;
    this.scopeInfo.set(null);
    this.apply([]);
  }

  byKey(key: string | null | undefined): BranchOption | undefined {
    return this.list().find(o => o.key === key);
  }

  /** The option of a stored type + id pair. */
  byRef(type: string | null | undefined, id: number | string | null | undefined): BranchOption | undefined {
    return this.byKey(unitKey(type, id));
  }

  /** Display name of a stored type + id pair ('' when unknown). */
  nameOf(type: string | null | undefined, id: number | string | null | undefined): string {
    return this.byRef(type, id)?.name ?? '';
  }

  /** Matches the display name ("X (Franchise)") first, then a bare name (branches win a tie). */
  byName(name: string | null | undefined): BranchOption | undefined {
    const list = this.list();
    return list.find(o => o.name === name) ?? list.find(o => o.shortName === name);
  }

  private apply(rows: BranchOption[]): void {
    this.list.set(rows);
    this.nameList.splice(0, this.nameList.length, ...rows.map(o => o.name));
  }
}

function toOptions(rows: unknown, type: UnitType): BranchOption[] {
  return ((Array.isArray(rows) ? rows : []) as any[])
    .filter(r => Number(r?.id) > 0)
    .map(r => ({
      id: Number(r.id), type, key: unitKey(type, r.id), name: r.name, shortName: r.short_name ?? r.name, code: r.code ?? '',
    }));
}
