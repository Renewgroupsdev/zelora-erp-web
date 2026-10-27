import { Component, input } from '@angular/core';
import { VisitRow, statusTone } from '../../../shared/models/dashboard.model';
import { initials, to12Hour } from '../../../shared/utils/format.util';

/** Compact list of visits (time, patient, treatment, doctor, status) used by the clinic widgets. */
@Component({
  selector: 'app-visit-list',
  standalone: true,
  template: `
    @if (rows().length) {
      <ul class="dash-list">
        @for (v of rows(); track v.id) {
          <li>
            <span class="dash-time">{{ to12Hour(v.time) ?? '--' }}</span>
            <span class="dash-avatar">{{ initials(v.name) }}</span>
            <div class="dash-list-main">
              <strong>{{ v.name }}</strong>
              <small>{{ v.treatment || v.category || 'Consultation' }}@if (v.doctor) { &middot; {{ v.doctor }} }@if (v.type === 'walk-in') { &middot; Walk-in }</small>
            </div>
            <span class="dash-pill" [class]="'tone-' + tone(v.status)">{{ v.status }}</span>
          </li>
        }
      </ul>
    } @else {
      <p class="dash-muted">{{ emptyText() }}</p>
    }
  `,
})
export class VisitList {
  readonly rows = input<VisitRow[]>([]);
  readonly emptyText = input('Nothing scheduled.');
  readonly tone = statusTone;
  readonly initials = initials;
  readonly to12Hour = to12Hour;
}
