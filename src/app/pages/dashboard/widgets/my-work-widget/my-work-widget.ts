import { Component, computed, ViewEncapsulation } from '@angular/core';
import { MyWorkData, statusTone } from '../../../../shared/models/dashboard.model';
import { displayDate, displayTime, monthLabel } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashKpi } from '../dash-kpi/dash-kpi';
import { DashWidget } from '../dash-widget';

/**
 * The signed-in employee's own work: tasks and progress, attendance this month, leave balance, latest payslip and
 * appraisal. Only this employee's records - never anyone else's salary or the company's figures.
 */
@Component({
  selector: 'app-my-work-widget',
  standalone: true,
  imports: [DashCard, DashKpi],
  templateUrl: './my-work-widget.html',
  styleUrl: './my-work-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class MyWorkWidget extends DashWidget<MyWorkData> {
  protected readonly key = 'my-work' as const;
  readonly tone = statusTone;
  readonly displayDate = displayDate;
  readonly displayTime = displayTime;
  readonly monthLabel = monthLabel;
  readonly year = new Date().getFullYear();

  readonly subtitle = computed(() => {
    const e = this.data()?.employee;
    return e ? `${e.designation} · ${e.department} · ${e.emp_code}` : 'Your tasks, attendance, leave and payslip';
  });
  readonly leaveLeft = computed(() => (this.data()?.leave?.balance ?? []).reduce((s, b) => s + b.left, 0));

  stars(rating: number): string {
    const r = Math.max(0, Math.min(5, Math.round(rating)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }
}
