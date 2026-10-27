import { Component, computed } from '@angular/core';
import { BfBars } from '../../../shared/components/bf-charts/bf-bars/bf-bars';
import { BfColumns } from '../../../shared/components/bf-charts/bf-columns/bf-columns';
import { BfDonut } from '../../../shared/components/bf-charts/bf-donut/bf-donut';
import { LeadsData } from '../../../shared/models/dashboard.model';
import { DashCard } from './dash-card';
import { DashWidget } from './dash-widget';

/** Lead pipeline for the period: funnel to customer, where the leads came from and how they arrived over time. */
@Component({
  selector: 'app-leads-widget',
  standalone: true,
  imports: [DashCard, BfBars, BfDonut, BfColumns],
  template: `
    <app-dash-card title="Lead Funnel" subtitle="From new lead to paying customer" icon="bi-funnel" tone="blue"
                   [link]="canOpen('lead-management') ? '/app/lead-management' : null" linkLabel="Leads"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()"
                   [empty]="data()?.total === 0" emptyText="No leads came in during this period." emptyIcon="bi-person-plus">
      @if (data(); as l) {
        <div class="dash-chips">
          <span class="dash-chip"><b>{{ l.total }}</b> new leads</span>
          <span class="dash-chip tone-green"><b>{{ l.conversion_rate }}%</b> converted</span>
          @if (l.unassigned) { <span class="dash-chip tone-orange"><b>{{ l.unassigned }}</b> waiting for a telecaller</span> }
        </div>
        <div class="dash-split">
          <div class="dash-chart"><h3>Funnel</h3><app-bf-bars [data]="funnel()" emptyText="No leads yet" /></div>
          <div class="dash-chart"><h3>By source</h3><app-bf-donut [data]="l.by_source" centerLabel="Leads" emptyText="No sources yet" /></div>
        </div>
        <div class="dash-chart"><h3>Leads received</h3><app-bf-columns [data]="trend()" aName="Leads" emptyText="No leads in this period" /></div>
      }
    </app-dash-card>
  `,
})
export class LeadsWidget extends DashWidget<LeadsData> {
  protected readonly key = 'leads' as const;
  readonly funnel = computed(() => this.data()?.funnel ?? []);
  readonly trend = computed(() => (this.data()?.trend ?? []).map(t => ({ label: t.label, a: t.value })));
}
