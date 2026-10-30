import { Component, computed, ViewEncapsulation } from '@angular/core';
import { UnitsData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** Every branch and franchise for the period as a card: collections, share, leads, visits and new customers. */
@Component({
  selector: 'app-units-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './units-widget.html',
  styleUrl: './units-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class UnitsWidget extends DashWidget<UnitsData> {
  protected readonly key = 'units' as const;

  readonly units = computed(() => {
    const d = this.data();
    const total = d?.total_revenue ?? 0;
    return [...(d?.units ?? [])]
      .sort((a, b) => b.revenue - a.revenue)
      .map(u => ({ ...u, share: total > 0 ? ((u.revenue / total) * 100).toFixed(1).replace(/\.0$/, '') : '0' }));
  });
}
