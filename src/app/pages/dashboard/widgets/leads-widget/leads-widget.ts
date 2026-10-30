import { Component, computed, ViewEncapsulation } from '@angular/core';
import { LeadsData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

const STAGE_TONES = ['green', 'blue', 'orange', 'purple', 'teal', 'indigo'];
const STAGE_ICONS = ['bi-person-plus', 'bi-telephone', 'bi-calendar2-check', 'bi-check2-circle', 'bi-star', 'bi-heart'];
const SOURCE_TONES = ['teal', 'purple', 'blue', 'orange', 'red', 'indigo', 'green', 'gray'];

/**
 * Lead pipeline for the period: one tile per funnel stage, a tapered funnel, and the sources with their share beside a
 * ring of how many leads became customers.
 */
@Component({
  selector: 'app-leads-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './leads-widget.html',
  styleUrl: './leads-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class LeadsWidget extends DashWidget<LeadsData> {
  protected readonly key = 'leads' as const;

  readonly funnel = computed(() => this.data()?.funnel ?? []);

  /** Each stage narrows a step (the funnel shape); the counts and "% of prior" carry the actual proportions. */
  readonly stages = computed(() => {
    const f = this.funnel();
    const step = f.length > 1 ? Math.min(10, 36 / (f.length - 1)) : 0;
    return f.map((s, i) => {
      const prior = i > 0 ? f[i - 1].value : null;
      return {
        label: s.label, value: s.value,
        tone: STAGE_TONES[i % STAGE_TONES.length], icon: STAGE_ICONS[i % STAGE_ICONS.length],
        taper: `${(i * step) / 2}%`,
        ofPrior: prior === null ? null : prior ? Math.round((s.value / prior) * 1000) / 10 : 0,
      };
    });
  });

  readonly sources = computed(() => {
    const src = this.data()?.by_source ?? [];
    const total = src.reduce((sum, s) => sum + s.value, 0) || 1;
    return src.slice(0, 6).map((s, i) => ({ ...s, tone: SOURCE_TONES[i % SOURCE_TONES.length], pct: Math.round((s.value / total) * 100) }));
  });

  clamp(v: number): number {
    return Math.max(0, Math.min(100, v));
  }
}
