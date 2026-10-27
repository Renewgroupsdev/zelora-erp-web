import { Component } from '@angular/core';
import { BfBars } from '../../../shared/components/bf-charts/bf-bars/bf-bars';
import { BfDonut } from '../../../shared/components/bf-charts/bf-donut/bf-donut';
import { AppointmentsData } from '../../../shared/models/dashboard.model';
import { DashCard } from './dash-card';
import { DashWidget } from './dash-widget';
import { VisitList } from './visit-list';

/** Today's visits, how the period's appointments ended up, revenue per treatment and the sittings workload. */
@Component({
  selector: 'app-appointments-widget',
  standalone: true,
  imports: [DashCard, BfBars, BfDonut, VisitList],
  template: `
    <app-dash-card title="Appointments & Treatments" subtitle="Clinic workload and treatment revenue" icon="bi-calendar2-check" tone="purple"
                   [link]="canOpen('appoinment') ? '/app/appointments' : null" linkLabel="Appointments"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()">
      @if (data(); as a) {
        <div class="dash-figures">
          <div><span>Sittings today</span><strong>{{ a.sittings_today }}</strong></div>
          <div><span>Overdue sittings</span><strong [class.txt-red]="a.sittings_overdue > 0">{{ a.sittings_overdue }}</strong></div>
          <div><span>Sittings done</span><strong class="txt-green">{{ a.sittings_completed }}</strong><small>in this period</small></div>
        </div>
        <div class="dash-split">
          <div class="dash-chart"><h3>Appointment status</h3><app-bf-donut [data]="a.status_mix" centerLabel="Visits" emptyText="No appointments in this period" /></div>
          <div class="dash-chart"><h3>Revenue by treatment</h3><app-bf-bars [data]="a.by_treatment" [money]="true" emptyText="No treatment plans started" /></div>
        </div>
        <h3 class="dash-sub">Today's visits</h3>
        <app-visit-list [rows]="a.today" emptyText="No visits booked for today." />
      }
    </app-dash-card>
  `,
})
export class AppointmentsWidget extends DashWidget<AppointmentsData> {
  protected readonly key = 'appointments' as const;
}
