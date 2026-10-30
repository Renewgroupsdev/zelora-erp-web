import { Component, ViewEncapsulation } from '@angular/core';
import { BfDonut } from '../../../../shared/components/bf-charts/bf-donut/bf-donut';
import { LeadsData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** Where the period's leads came from (same endpoint as the lead funnel; the API caches it for a minute). */
@Component({
  selector: 'app-lead-source-widget',
  standalone: true,
  imports: [DashCard, BfDonut],
  templateUrl: './lead-source-widget.html',
  styleUrl: './lead-source-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class LeadSourceWidget extends DashWidget<LeadsData> {
  protected readonly key = 'leads' as const;
}
