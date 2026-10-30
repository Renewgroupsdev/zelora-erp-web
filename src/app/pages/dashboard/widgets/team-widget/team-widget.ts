import { Component, computed, ViewEncapsulation } from '@angular/core';
import { BfDonut } from '../../../../shared/components/bf-charts/bf-donut/bf-donut';
import { HrData } from '../../../../shared/models/dashboard.model';
import { monthLabel } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** The team today (attendance, who is on leave), headcount by department and last month's payroll. */
@Component({
  selector: 'app-team-widget',
  standalone: true,
  imports: [DashCard, BfDonut],
  templateUrl: './team-widget.html',
  styleUrl: './team-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class TeamWidget extends DashWidget<HrData> {
  protected readonly key = 'hr' as const;
  readonly payrollMonth = computed(() => {
    const m = this.data()?.payroll_last_month.month;
    return m ? monthLabel(m) : '';
  });
}
