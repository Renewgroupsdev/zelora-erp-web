import { Component, input, ViewEncapsulation } from '@angular/core';
import { VisitRow, statusTone } from '../../../../shared/models/dashboard.model';
import { initials, to12Hour } from '../../../../shared/utils/format.util';

/** Compact list of visits (time, patient, treatment, doctor, status) used by the clinic widgets. */
@Component({
  selector: 'app-visit-list',
  standalone: true,
  templateUrl: './visit-list.html',
  styleUrl: './visit-list.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class VisitList {
  readonly rows = input<VisitRow[]>([]);
  readonly emptyText = input('Nothing scheduled.');
  readonly tone = statusTone;
  readonly initials = initials;
  readonly to12Hour = to12Hour;
}
