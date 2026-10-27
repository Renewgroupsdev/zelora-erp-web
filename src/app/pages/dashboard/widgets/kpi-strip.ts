import { Component } from '@angular/core';
import { KpisData } from '../../../shared/models/dashboard.model';
import { DashKpi } from './dash-kpi';
import { DashWidget } from './dash-widget';

/** Headline numbers of the business (or the unit, for a branch / franchise login) for the chosen period. */
@Component({
  selector: 'app-kpi-strip',
  standalone: true,
  imports: [DashKpi],
  template: `
    @if (loading()) {
      <div class="dash-kpis" aria-label="Loading key figures">
        @for (i of [1, 2, 3, 4, 5, 6, 7, 8]; track i) { <div class="dash-kpi is-skeleton"><span class="sk sk-md"></span><span class="sk sk-lg"></span><span class="sk"></span></div> }
      </div>
    } @else if (error()) {
      <div class="dash-inline-error" role="alert"><i class="bi bi-exclamation-octagon"></i> {{ error() }} <button type="button" class="dash-btn" (click)="retry()">Retry</button></div>
    } @else if (data(); as k) {
      <div class="dash-kpis" [class.is-refreshing]="refreshing()">
        <app-dash-kpi label="Collections" icon="bi-cash-coin" tone="green" [value]="inrShort(k.collections.value)" [change]="k.collections.change" hint="Treatment payments + consultation fees" />
        <app-dash-kpi label="Sales billed" icon="bi-receipt" tone="primary" [value]="inrShort(k.sales.value)" [change]="k.sales.change" hint="Treatment plans started" />
        <app-dash-kpi label="New leads" icon="bi-person-plus" tone="blue" [value]="k.new_leads.value.toLocaleString('en-IN')" [change]="k.new_leads.change" [hint]="k.conversion_rate.value + '% converted to customers'" />
        <app-dash-kpi label="Appointments" icon="bi-calendar2-check" tone="purple" [value]="k.appointments.value.toLocaleString('en-IN')" [change]="k.appointments.change" [hint]="k.appointments_today.value + ' scheduled today'" />
        <app-dash-kpi label="New customers" icon="bi-person-heart" tone="green" [value]="k.new_customers.value.toLocaleString('en-IN')" [change]="k.new_customers.change" [hint]="k.active_customers.value + ' with an active treatment'" />
        <app-dash-kpi label="Lead conversion" icon="bi-funnel" tone="orange" [value]="k.conversion_rate.value + '%'" [change]="k.conversion_rate.change" hint="Leads of the period now customers" />
        <app-dash-kpi label="Team present today" icon="bi-people" tone="blue" [value]="k.present_today.value + ' / ' + k.headcount.value" [hint]="(k.present_today.rate ?? 0) + '% attendance'" />
        <app-dash-kpi label="Stock value" icon="bi-box-seam" tone="primary" [value]="inrShort(k.stock_value.value)" hint="At purchase price, on hand now" />
      </div>
    }
  `,
})
export class KpiStrip extends DashWidget<KpisData> {
  protected readonly key = 'kpis' as const;
}
