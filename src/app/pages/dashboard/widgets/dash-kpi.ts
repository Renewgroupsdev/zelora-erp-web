import { Component, computed, input } from '@angular/core';

/**
 * One KPI tile: value, label, a hint line and the change against the previous period (green when it moved the good way;
 * `lowerIsBetter` flips that, e.g. for expenses). `change` null = point-in-time figure, no comparison shown.
 */
@Component({
  selector: 'app-dash-kpi',
  standalone: true,
  template: `
    <article class="dash-kpi" [class]="'tone-' + tone()">
      <div class="dash-kpi-top">
        <span class="dash-kpi-icon"><i class="bi" [class]="icon()" aria-hidden="true"></i></span>
        @if (change() !== null) {
          <span class="dash-trend" [class.is-good]="good()" [class.is-bad]="!good() && change() !== 0"
                [attr.aria-label]="'Change vs previous period ' + change() + '%'">
            <i class="bi" [class]="(change() ?? 0) >= 0 ? 'bi-arrow-up-right' : 'bi-arrow-down-right'" aria-hidden="true"></i>
            {{ abs() }}%
          </span>
        }
      </div>
      <strong class="dash-kpi-value">{{ value() }}</strong>
      <span class="dash-kpi-label">{{ label() }}</span>
      @if (hint()) { <small class="dash-kpi-hint">{{ hint() }}</small> }
    </article>
  `,
  // Styled by the dashboard page (dashboard.scss, scoped under .dash-page).
})
export class DashKpi {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input('bi-graph-up');
  readonly tone = input<'primary' | 'blue' | 'green' | 'orange' | 'purple' | 'red'>('primary');
  readonly change = input<number | null>(null);
  readonly hint = input('');
  readonly lowerIsBetter = input(false);

  readonly abs = computed(() => Math.abs(this.change() ?? 0).toFixed(1).replace(/\.0$/, ''));
  readonly good = computed(() => ((this.change() ?? 0) >= 0) !== this.lowerIsBetter());
}
