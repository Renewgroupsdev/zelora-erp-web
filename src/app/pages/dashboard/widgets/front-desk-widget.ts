import { Component } from '@angular/core';
import { FrontDeskData } from '../../../shared/models/dashboard.model';
import { DashCard } from './dash-card';
import { DashKpi } from './dash-kpi';
import { DashWidget } from './dash-widget';
import { VisitList } from './visit-list';

/** Front office: today's visit queue, consultations waiting on terms / conversion and balances to collect. */
@Component({
  selector: 'app-front-desk-widget',
  standalone: true,
  imports: [DashCard, DashKpi, VisitList],
  template: `
    <app-dash-card title="Front Desk" subtitle="Today's visits and what to follow up at the counter" icon="bi-person-workspace" tone="blue"
                   [link]="canOpen('appoinment') ? '/app/appointments' : null" linkLabel="Appointments"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()">
      @if (data(); as d) {
        <div class="dash-kpis is-inner">
          <app-dash-kpi label="Visits today" icon="bi-calendar2-day" tone="blue" [value]="'' + d.appointments_today" [hint]="d.checked_in + ' checked in · ' + d.walk_ins_today + ' walk-ins'" />
          <app-dash-kpi label="Sittings today" icon="bi-heart-pulse" tone="purple" [value]="d.sittings_done_today + ' / ' + d.sittings_today" hint="Completed / scheduled" />
          <app-dash-kpi label="Awaiting terms" icon="bi-file-earmark-check" tone="orange" [value]="'' + d.awaiting_terms" [hint]="d.invoiced_not_converted + ' invoiced, not converted'" />
          <app-dash-kpi label="Balances to collect" icon="bi-cash-coin" tone="red" [value]="inrShort(d.pending_payments.amount)" [hint]="d.pending_payments.count + ' treatment plans'" />
        </div>
        <div class="dash-split">
          <div><h3 class="dash-sub">Today's queue</h3><app-visit-list [rows]="d.today" emptyText="No visits booked for today." /></div>
          <div>
            <h3 class="dash-sub">Collect at the counter</h3>
            @if (d.pending_payments.items.length) {
              <ul class="dash-list is-compact">
                @for (p of d.pending_payments.items; track p.id) {
                  <li><div class="dash-list-main"><strong>{{ p.customer }}</strong><small>{{ p.treatment }} &middot; {{ p.mobile }}</small></div><span class="dash-amount">{{ inr(p.due) }}</span></li>
                }
              </ul>
            } @else { <div class="dash-ok"><i class="bi bi-check2-circle" aria-hidden="true"></i> Every active plan is paid up.</div> }
          </div>
        </div>
      }
    </app-dash-card>
  `,
})
export class FrontDeskWidget extends DashWidget<FrontDeskData> {
  protected readonly key = 'front-desk' as const;
}
