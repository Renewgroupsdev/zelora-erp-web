import { Component, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MyDayData, duration, statusTone } from '../../../../shared/models/dashboard.model';
import { displayTime } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashKpi } from '../dash-kpi/dash-kpi';
import { DashWidget } from '../dash-widget';

/** Telecaller's day: the work queue, today's calls, appointments booked and the follow-ups due now. */
@Component({
  selector: 'app-my-day-widget',
  standalone: true,
  imports: [DashCard, DashKpi, RouterLink],
  templateUrl: './my-day-widget.html',
  styleUrl: './my-day-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class MyDayWidget extends DashWidget<MyDayData> {
  protected readonly key = 'my-day' as const;
  readonly duration = duration;
  readonly tone = statusTone;
  readonly displayTime = displayTime;
}
