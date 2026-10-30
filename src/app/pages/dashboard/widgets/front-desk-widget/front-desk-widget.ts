import { Component, ViewEncapsulation } from '@angular/core';
import { FrontDeskData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashKpi } from '../dash-kpi/dash-kpi';
import { DashWidget } from '../dash-widget';
import { VisitList } from '../visit-list/visit-list';

/** Front office: today's visit queue, consultations waiting on terms / conversion and balances to collect. */
@Component({
  selector: 'app-front-desk-widget',
  standalone: true,
  imports: [DashCard, DashKpi, VisitList],
  templateUrl: './front-desk-widget.html',
  styleUrl: './front-desk-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class FrontDeskWidget extends DashWidget<FrontDeskData> {
  protected readonly key = 'front-desk' as const;
}
