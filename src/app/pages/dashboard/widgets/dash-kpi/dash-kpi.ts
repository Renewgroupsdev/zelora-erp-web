import { Component, computed, input, ViewEncapsulation } from '@angular/core';

/**
 * One KPI tile: value, label, a hint line and the change against the previous period (green when it moved the good way;
 * `lowerIsBetter` flips that, e.g. for expenses). `change` null = point-in-time figure, no comparison shown.
 */
@Component({
  selector: 'app-dash-kpi',
  standalone: true,
  templateUrl: './dash-kpi.html',
  styleUrl: './dash-kpi.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
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
