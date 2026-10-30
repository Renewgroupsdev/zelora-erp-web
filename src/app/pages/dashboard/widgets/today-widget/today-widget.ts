import { Component, computed, ViewEncapsulation } from '@angular/core';
import { KpisData } from '../../../../shared/models/dashboard.model';
import { DashWidget } from '../dash-widget';

/**
 * Today's overview for the right rail: team attendance as a ring, then today's appointments, lead conversion and the
 * team present against headcount (same endpoint as the figure cards; the API caches it for a minute).
 */
@Component({
  selector: 'app-today-widget',
  standalone: true,
  templateUrl: './today-widget.html',
  styleUrl: './today-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class TodayWidget extends DashWidget<KpisData> {
  protected readonly key = 'kpis' as const;
  readonly todayShort = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  readonly attendance = computed(() => this.clamp(this.data()?.present_today.rate ?? 0));

  clamp(v: number): number {
    return Math.max(0, Math.min(100, Math.round(v)));
  }
}
