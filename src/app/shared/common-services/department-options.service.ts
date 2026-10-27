import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from './api-route-constants';
import { ToastService } from './toast.service';

/**
 * The active departments (Settings -> Department Module, GET /departments/options) behind every Department dropdown and
 * filter. Loaded once and shared; the Department Module page calls `refresh()` after an add / edit / delete so the
 * other screens pick the change up. Kept free of other services so any service can inject it.
 */
@Injectable({ providedIn: 'root' })
export class DepartmentOptionsService {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);

  private readonly list = signal<string[]>([]);
  private request$: Observable<string[]> | null = null;

  /** Active department names, in creation order. */
  readonly names = computed(() => this.list());
  /**
   * The same names as one array that is refilled in place on every load, for filter configs that keep a reference to
   * the list (e.g. `options: hr.departments`); computed()s should read `names` instead.
   */
  readonly nameList: string[] = [];

  /** The first call fetches, later calls reuse it; `force` re-reads. A failed request is retried by the next call. */
  load(force = false): Observable<string[]> {
    if (!this.request$ || force) {
      this.request$ = (this.api.GET(ApiRoutesConstants.DEPARTMENT_OPTIONS) as Observable<any>).pipe(
        map(res => ((res?.data ?? []) as { name: string }[]).map(d => d.name)),
        tap(names => {
          this.apply(names);
          // Nothing configured yet (or not seeded when the app loaded): ask again next time instead of keeping [] for good.
          if (!names.length) this.request$ = null;
        }),
        catchError(err => {
          this.request$ = null;
          // 403 = an account type without staff screens (customer portal): no departments to show, nothing went wrong.
          if (err?.status === 403) return of(this.list());
          console.error('GET /departments/options failed', err);
          this.toast.error('Could not load the department list. Check the server connection and try again.');
          return of(this.list());
        }),
        shareReplay(1),
      );
    }
    return this.request$;
  }

  /** Fire-and-forget load for screens that read `names` / `nameList`. */
  ensure(): void {
    this.load().subscribe();
  }

  refresh(): void {
    this.load(true).subscribe();
  }

  /** Forget the list (sign-out / another login). */
  reset(): void {
    this.request$ = null;
    this.apply([]);
  }

  private apply(names: string[]): void {
    this.list.set(names);
    this.nameList.splice(0, this.nameList.length, ...names);
  }
}
