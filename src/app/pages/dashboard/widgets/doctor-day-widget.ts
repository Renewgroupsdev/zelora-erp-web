import { Component } from '@angular/core';
import { DoctorDayData, statusTone } from '../../../shared/models/dashboard.model';
import { to12Hour } from '../../../shared/utils/format.util';
import { DashCard } from './dash-card';
import { DashKpi } from './dash-kpi';
import { DashWidget } from './dash-widget';

/** Doctor's clinic day: consultations and sittings in time order, and the notes / photos still to complete. */
@Component({
  selector: 'app-doctor-day-widget',
  standalone: true,
  imports: [DashCard, DashKpi],
  template: `
    <app-dash-card title="My Clinic Day" subtitle="Consultations and sittings booked with you" icon="bi-heart-pulse" tone="red"
                   [link]="canOpen('appoinment') ? '/app/appointments' : null" linkLabel="Appointments"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()">
      @if (data(); as d) {
        <div class="dash-kpis is-inner">
          <app-dash-kpi label="Consultations today" icon="bi-clipboard2-pulse" tone="blue" [value]="'' + d.consultations_today.length" [hint]="d.waiting + ' waiting'" />
          <app-dash-kpi label="Sittings today" icon="bi-heart-pulse" tone="purple" [value]="'' + d.sittings_today.length" [hint]="d.upcoming_week + ' in the next 7 days'" />
          <app-dash-kpi label="Notes / photos pending" icon="bi-journal-medical" [tone]="d.pending_notes ? 'orange' : 'green'" [value]="'' + d.pending_notes" hint="Due sittings missing your part" />
          <app-dash-kpi label="Sittings completed" icon="bi-check2-circle" tone="green" [value]="d.completed + ' / ' + d.scheduled" [hint]="d.consultations_period + ' consultations this period'" />
        </div>
        <div class="dash-split">
          <div>
            <h3 class="dash-sub">Consultations</h3>
            @if (d.consultations_today.length) {
              <ul class="dash-list">
                @for (c of d.consultations_today; track c.id) {
                  <li>
                    <span class="dash-time">{{ to12Hour(c.time) ?? '--' }}</span>
                    <div class="dash-list-main"><strong>{{ c.name }}</strong><small>{{ c.treatment || c.category || 'Consultation' }} &middot; step {{ c.step }} of 5</small></div>
                    <span class="dash-pill" [class]="'tone-' + tone(c.status)">{{ c.status }}</span>
                  </li>
                }
              </ul>
            } @else { <p class="dash-muted">No consultations booked with you today.</p> }
          </div>
          <div>
            <h3 class="dash-sub">Treatment sittings</h3>
            @if (d.sittings_today.length) {
              <ul class="dash-list">
                @for (s of d.sittings_today; track s.id) {
                  <li>
                    <span class="dash-time">{{ to12Hour(s.time) ?? '--' }}</span>
                    <div class="dash-list-main"><strong>{{ s.customer }}</strong><small>{{ s.treatment }} &middot; sitting {{ s.sitting }}</small></div>
                    <span class="dash-pill" [class]="'tone-' + tone(s.status)">{{ s.status }}</span>
                  </li>
                }
              </ul>
            } @else { <p class="dash-muted">No sittings scheduled with you today.</p> }
          </div>
        </div>
      }
    </app-dash-card>
  `,
})
export class DoctorDayWidget extends DashWidget<DoctorDayData> {
  protected readonly key = 'doctor-day' as const;
  readonly tone = statusTone;
  readonly to12Hour = to12Hour;
}
