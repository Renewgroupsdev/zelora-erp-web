import { Component, ViewEncapsulation } from '@angular/core';
import { CustomerDashData } from '../../../../shared/models/dashboard.model';
import { displayDate, to12Hour } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashKpi } from '../dash-kpi/dash-kpi';
import { DashWidget } from '../dash-widget';

/** Customer portal: my treatment plans and progress, the next sittings, what I have paid and still owe, my documents. */
@Component({
  selector: 'app-customer-widget',
  standalone: true,
  imports: [DashCard, DashKpi],
  templateUrl: './customer-widget.html',
  styleUrl: './customer-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class CustomerWidget extends DashWidget<CustomerDashData> {
  protected readonly key = 'customer' as const;
  readonly displayDate = displayDate;
  readonly to12Hour = to12Hour;
}
