import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MyDayData, duration, statusTone } from '../../../shared/models/dashboard.model';
import { displayTime } from '../../../shared/utils/format.util';
import { DashCard } from './dash-card';
import { DashKpi } from './dash-kpi';
import { DashWidget } from './dash-widget';

/** Telecaller's day: the work queue, today's calls, appointments booked and the follow-ups due now. */
@Component({
  selector: 'app-my-day-widget',
  standalone: true,
  imports: [DashCard, DashKpi, RouterLink],
  template: `
    <app-dash-card title="My Day" subtitle="Your calls, follow-ups and bookings" icon="bi-telephone-outbound" tone="primary"
                   [link]="canOpen('follow-up') ? '/app/follow-ups' : null" linkLabel="Follow-ups"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()">
      @if (data(); as d) {
        <div class="dash-status" [class]="'tone-' + tone(d.agent_status)"><span class="dash-dot" aria-hidden="true"></span>Call status: {{ d.agent_status.replace('_', ' ') }}</div>
        <div class="dash-kpis is-inner">
          <app-dash-kpi label="Follow-ups due today" icon="bi-alarm" tone="orange" [value]="'' + d.queue.follow_ups_today" [hint]="d.queue.follow_ups_overdue + ' overdue'" />
          <app-dash-kpi label="Calls today" icon="bi-telephone" tone="blue" [value]="'' + d.calls_today.total" [hint]="d.calls_today.answered + ' answered · ' + duration(d.calls_today.talk_seconds) + ' talk'" />
          <app-dash-kpi label="Appointments booked" icon="bi-calendar-plus" tone="purple" [value]="'' + d.appointments_booked" [hint]="d.appointments_today + ' visiting today'" />
          <app-dash-kpi label="My conversions" icon="bi-trophy" tone="green" [value]="'' + d.conversions" [hint]="d.conversion_rate + '% of my bookings'" />
          <app-dash-kpi label="Assigned leads" icon="bi-person-lines-fill" tone="primary" [value]="'' + d.queue.assigned" [hint]="d.queue.never_contacted + ' not contacted yet'" />
        </div>
        <h3 class="dash-sub">Call next</h3>
        @if (d.follow_ups.length) {
          <ul class="dash-list">
            @for (f of d.follow_ups; track f.id) {
              <li>
                <span class="dash-time" [class.txt-red]="f.overdue">{{ f.overdue ? 'Overdue' : displayTime(f.due) }}</span>
                <div class="dash-list-main"><strong>{{ f.name }}</strong><small>{{ f.mobile }}@if (f.last_call) { &middot; last call: {{ f.last_call }} }</small></div>
                @if (f.status) { <span class="dash-pill" [class]="'tone-' + tone(f.status)">{{ f.status }}</span> }
              </li>
            }
          </ul>
        } @else {
          <div class="dash-ok"><i class="bi bi-check2-circle" aria-hidden="true"></i> No follow-ups due - pick up new leads from Lead Management.</div>
        }
        @if (canOpen('lead-management')) {
          <a class="dash-btn is-wide" routerLink="/app/lead-management"><i class="bi bi-person-lines-fill" aria-hidden="true"></i> Open my leads</a>
        }
      }
    </app-dash-card>
  `,
})
export class MyDayWidget extends DashWidget<MyDayData> {
  protected readonly key = 'my-day' as const;
  readonly duration = duration;
  readonly tone = statusTone;
  readonly displayTime = displayTime;
}
