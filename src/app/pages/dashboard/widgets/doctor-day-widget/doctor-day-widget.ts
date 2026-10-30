import { Component, ViewEncapsulation } from '@angular/core';
import { DoctorDayData, statusTone } from '../../../../shared/models/dashboard.model';
import { to12Hour } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashKpi } from '../dash-kpi/dash-kpi';
import { DashWidget } from '../dash-widget';

/** Doctor's clinic day: consultations and sittings in time order, and the notes / photos still to complete. */
@Component({
  selector: 'app-doctor-day-widget',
  standalone: true,
  imports: [DashCard, DashKpi],
  templateUrl: './doctor-day-widget.html',
  styleUrl: './doctor-day-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class DoctorDayWidget extends DashWidget<DoctorDayData> {
  protected readonly key = 'doctor-day' as const;
  readonly tone = statusTone;
  readonly to12Hour = to12Hour;
}
