import { Component, computed } from '@angular/core';
import { BfBars } from '../../../shared/components/bf-charts/bf-bars/bf-bars';
import { UnitsData } from '../../../shared/models/dashboard.model';
import { DashCard } from './dash-card';
import { DashWidget } from './dash-widget';

/** Every branch and franchise side by side for the period: collections, leads, new customers, visits. */
@Component({
  selector: 'app-units-widget',
  standalone: true,
  imports: [DashCard, BfBars],
  template: `
    <app-dash-card title="Branch & Franchise Performance" subtitle="Who is driving the business this period" icon="bi-diagram-3" tone="primary"
                   [link]="canOpen('branch-management') ? '/app/branches' : null" linkLabel="Branches"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()"
                   [empty]="!data()?.units?.length" emptyText="No active branches or franchises." emptyIcon="bi-shop-window">
      @if (data(); as u) {
        <div class="dash-split">
          <div class="dash-chart"><h3>Collections by unit</h3><app-bf-bars [data]="bars()" [money]="true" emptyText="No collections in this period" /></div>
          <div class="dash-table-wrap">
            <table class="dash-table">
              <thead><tr><th>Unit</th><th class="num">Collections</th><th class="num">Share</th><th class="num">Leads</th><th class="num">Customers</th><th class="num">Visits</th></tr></thead>
              <tbody>
                @for (r of u.units; track r.key) {
                  <tr>
                    <td><span class="dash-unit-type" [class]="'tone-' + (r.type === 'branch' ? 'blue' : 'purple')">{{ r.type === 'branch' ? 'BR' : 'FR' }}</span> {{ r.name }}</td>
                    <td class="num">{{ inrShort(r.revenue) }}</td>
                    <td class="num">{{ share(r.revenue) }}%</td>
                    <td class="num">{{ r.leads }}</td>
                    <td class="num">{{ r.new_customers }}</td>
                    <td class="num">{{ r.appointments }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </app-dash-card>
  `,
})
export class UnitsWidget extends DashWidget<UnitsData> {
  protected readonly key = 'units' as const;
  readonly bars = computed(() => (this.data()?.units ?? []).filter(u => u.revenue > 0).slice(0, 8).map(u => ({ label: u.name, value: u.revenue })));

  share(value: number): string {
    const total = this.data()?.total_revenue ?? 0;
    return total > 0 ? ((value / total) * 100).toFixed(1).replace(/\.0$/, '') : '0';
  }
}
