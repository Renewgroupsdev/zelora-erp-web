import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ChartDatum } from '../../models/common-components.model';

export type ChartCardType = 'donut' | 'bar';

interface SeriesEntry extends ChartDatum {
  colorSlot: number;
  isOther: boolean;
}

interface DonutSlice extends SeriesEntry {
  percent: number;
  dashArray: string;
  dashOffset: number;
}

interface BarSlice extends SeriesEntry {
  percent: number;
  widthPercent: number;
}

/** The validated categorical palette caps at 8 hued slots (see the dataviz skill) -
 *  past that the tail folds into a single neutral "Other" bucket rather than
 *  generating a 9th hue, which CVD checks can't clear. */
const MAX_HUED_SLOTS = 8;
const OTHER_LABEL = 'Other';
const DONUT_RADIUS = 70;
const DONUT_GAP = 3;

@Component({
  selector: 'app-common-chart-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './common-chart-card.html',
  styleUrl: './common-chart-card.scss',
})
export class CommonChartCard {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() totalLabel = 'Total';
  @Input() data: ChartDatum[] = [];
  @Input() loading = false;
  @Input() chartTypes: ChartCardType[] = ['donut', 'bar'];

  chartType: ChartCardType = 'donut';
  hoveredLabel: string | null = null;

  readonly radius = DONUT_RADIUS;
  readonly circumference = 2 * Math.PI * DONUT_RADIUS;

  setChartType(type: ChartCardType): void {
    this.chartType = type;
    this.hoveredLabel = null;
  }

  setHovered(label: string | null): void {
    this.hoveredLabel = label;
  }

  /** Sorted descending and capped at MAX_HUED_SLOTS; each entry's colorSlot is its
   *  fixed position in this list, so the same source always gets the same hue
   *  whether it's read from the donut or the bar view. */
  get series(): SeriesEntry[] {
    const sorted = [...this.data].sort((a, b) => b.value - a.value);

    if (sorted.length <= MAX_HUED_SLOTS) {
      return sorted.map((item, index) => ({ ...item, colorSlot: index, isOther: false }));
    }

    const head = sorted.slice(0, MAX_HUED_SLOTS - 1).map((item, index) => ({ ...item, colorSlot: index, isOther: false }));
    const tailTotal = sorted.slice(MAX_HUED_SLOTS - 1).reduce((sum, item) => sum + (item.value || 0), 0);

    return [...head, { label: OTHER_LABEL, value: tailTotal, colorSlot: MAX_HUED_SLOTS - 1, isOther: true }];
  }

  get total(): number {
    return this.series.reduce((sum, item) => sum + (item.value || 0), 0);
  }

  get donutSlices(): DonutSlice[] {
    const total = this.total || 1;
    let cursor = 0;

    return this.series.map((item) => {
      const length = (item.value / total) * this.circumference;
      const dash = Math.max(length - DONUT_GAP, 0);
      const slice: DonutSlice = {
        ...item,
        percent: (item.value / total) * 100,
        dashArray: `${dash} ${this.circumference - dash}`,
        dashOffset: -cursor,
      };
      cursor += length;
      return slice;
    });
  }

  get barSlices(): BarSlice[] {
    const total = this.total || 1;
    const max = Math.max(...this.series.map((item) => item.value), 1);

    return this.series.map((item) => ({
      ...item,
      percent: (item.value / total) * 100,
      widthPercent: (item.value / max) * 100,
    }));
  }

  get hovered(): DonutSlice | null {
    if (!this.hoveredLabel) return null;
    return this.donutSlices.find((slice) => slice.label === this.hoveredLabel) ?? null;
  }

  get centerValue(): string {
    return (this.hovered ? this.hovered.value : this.total).toLocaleString();
  }

  get centerLabel(): string {
    return this.hovered ? this.hovered.label : this.totalLabel;
  }

  get centerPercent(): string | null {
    return this.hovered ? `${this.hovered.percent.toFixed(1)}%` : null;
  }

  colorVar(entry: SeriesEntry): string {
    return entry.isOther ? 'var(--chart-series-other)' : `var(--chart-series-${entry.colorSlot})`;
  }

  tooltipText(entry: SeriesEntry, percent: number): string {
    return `${entry.label}: ${entry.value.toLocaleString()} (${percent.toFixed(1)}%)`;
  }
}
