import { Component, ViewEncapsulation } from '@angular/core';
import { StockData } from '../../../../shared/models/dashboard.model';
import { displayDate } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** Stock on hand, what is running low and what expires within 30 days. */
@Component({
  selector: 'app-stock-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './stock-widget.html',
  styleUrl: './stock-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class StockWidget extends DashWidget<StockData> {
  protected readonly key = 'stock' as const;
  readonly displayDate = displayDate;
}
