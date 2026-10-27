import { DestroyRef, Directive, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardService } from '../../../shared/common-services/dashboard.service';
import { DashPeriod, DashRange, DashWidgetKey } from '../../../shared/models/dashboard.model';
import { inrShort } from '../../../shared/models/branch-franchise.model';
import { inr } from '../../../shared/utils/format.util';

/**
 * Base for every dashboard widget: loads GET /api/dashboard/{key} for the page's range, again whenever the range or the
 * page's refresh tick changes, and keeps the last figures on screen while a refresh runs (only the first load shows the
 * skeleton). A failed load shows the widget's error state with a retry, without affecting the other widgets.
 */
@Directive()
export abstract class DashWidget<T> {
  protected abstract readonly key: DashWidgetKey;

  readonly range = input<DashRange>('month');
  /** Bumped by the page (Refresh button, auto refresh) to reload with the same range. */
  readonly tick = input(0);

  readonly data = signal<T | null>(null);
  readonly period = signal<DashPeriod | null>(null);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly error = signal<string | null>(null);

  protected readonly auth = inject(AuthService);
  private readonly api = inject(DashboardService);
  private sub?: Subscription;

  readonly inrShort = inrShort;
  readonly inr = inr;

  constructor() {
    effect(() => {
      const range = this.range();
      this.tick();
      untracked(() => this.load(range));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  retry(): void {
    this.load(this.range());
  }

  /** Drill-down links only show when the role can open the target module. */
  canOpen(moduleSlug: string): boolean {
    return this.auth.hasModuleAccess(moduleSlug);
  }

  private load(range: DashRange): void {
    this.sub?.unsubscribe();
    const first = this.data() === null;
    this.loading.set(first);
    this.refreshing.set(!first);
    this.error.set(null);

    this.sub = this.api.widget<T>(this.key, range).subscribe({
      next: res => {
        this.data.set(res?.data ?? null);
        this.period.set(res?.period ?? null);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.error.set(err?.status === 403 ? 'Your role no longer has this widget.' : (err?.error?.message ?? 'Could not load this section.'));
      },
    });
  }
}
