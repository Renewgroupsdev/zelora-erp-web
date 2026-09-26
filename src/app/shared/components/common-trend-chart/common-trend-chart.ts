import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface TrendPoint {
  period: string;
  total: number;
}

export type TrendGranularity = 'day' | 'week' | 'month';

interface PlottedPoint extends TrendPoint {
  x: number;
  y: number;
  label: string;
}

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 220;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const GRID_STEPS = 4;

@Component({
  selector: 'app-common-trend-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './common-trend-chart.html',
  styleUrl: './common-trend-chart.scss',
})
export class CommonTrendChart {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() points: TrendPoint[] = [];
  @Input() loading = false;
  @Input() granularity: TrendGranularity = 'month';
  @Output() granularityChange = new EventEmitter<TrendGranularity>();

  hoveredIndex: number | null = null;

  readonly viewWidth = VIEW_WIDTH;
  readonly viewHeight = VIEW_HEIGHT;
  readonly plotTop = PAD_TOP;
  readonly plotBottom = VIEW_HEIGHT - PAD_BOTTOM;

  setGranularity(value: TrendGranularity): void {
    if (value === this.granularity) return;
    this.granularity = value;
    this.granularityChange.emit(value);
  }

  setHovered(index: number | null): void {
    this.hoveredIndex = index;
  }

  private get maxValue(): number {
    return Math.max(...this.points.map((p) => p.total), 1);
  }

  get gridLines(): { y: number; value: number }[] {
    const max = this.maxValue;
    const lines: { y: number; value: number }[] = [];

    for (let step = 0; step <= GRID_STEPS; step++) {
      const value = Math.round((max / GRID_STEPS) * step);
      const ratio = max === 0 ? 0 : value / max;
      lines.push({ y: this.plotBottom - ratio * (this.plotBottom - this.plotTop), value });
    }

    return lines;
  }

  /** Full-height hit-target width per point (interaction.md: hit target > the mark),
   *  tiled edge-to-edge across the plot so hovering anywhere in a point's column works. */
  get hitWidth(): number {
    const count = this.points.length;
    if (count < 2) return this.viewWidth;
    return (this.viewWidth - PAD_LEFT - PAD_RIGHT) / (count - 1);
  }

  get plotted(): PlottedPoint[] {
    const max = this.maxValue;
    const count = this.points.length;
    const usableWidth = this.viewWidth - PAD_LEFT - PAD_RIGHT;

    return this.points.map((point, index) => {
      const x = count <= 1 ? PAD_LEFT + usableWidth / 2 : PAD_LEFT + (index / (count - 1)) * usableWidth;
      const ratio = max === 0 ? 0 : point.total / max;
      const y = this.plotBottom - ratio * (this.plotBottom - this.plotTop);
      return { ...point, x, y, label: this.formatPeriodLabel(point.period) };
    });
  }

  /** Smooths the polyline into a curve the same way the detail-card sparkline does -
   *  a quadratic Bezier through each segment's midpoint. */
  get linePath(): string {
    const pts = this.plotted;
    if (pts.length < 2) return '';

    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      path += ` Q ${curr.x},${curr.y} ${midX},${midY}`;
    }
    const last = pts[pts.length - 1];
    path += ` T ${last.x},${last.y}`;
    return path;
  }

  get areaPath(): string {
    const pts = this.plotted;
    if (pts.length < 2) return '';

    const last = pts[pts.length - 1];
    return `${this.linePath} L ${last.x},${this.plotBottom} L ${pts[0].x},${this.plotBottom} Z`;
  }

  /** Thins x-axis labels so they never overlap: shows at most ~7 across the width. */
  get visibleLabelIndexes(): Set<number> {
    const count = this.plotted.length;
    const maxLabels = 7;
    const step = Math.max(1, Math.ceil(count / maxLabels));
    const indexes = new Set<number>();

    for (let i = 0; i < count; i += step) indexes.add(i);
    indexes.add(count - 1);
    return indexes;
  }

  get hovered(): PlottedPoint | null {
    if (this.hoveredIndex === null) return null;
    return this.plotted[this.hoveredIndex] ?? null;
  }

  get latest(): PlottedPoint | null {
    const pts = this.plotted;
    return pts.length ? pts[pts.length - 1] : null;
  }

  /** The backend's `period` string shape depends on granularity (YYYY-MM-DD / IYYY-IW /
   *  YYYY-MM), all "\d{4}-\d{2}"-ish - so the active granularity picks the formatter,
   *  not the string's shape. */
  private formatPeriodLabel(period: string): string {
    if (this.granularity === 'day') {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
      if (match) {
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return date.toLocaleString('en-US', { day: '2-digit', month: 'short' });
      }
    }

    if (this.granularity === 'week') {
      const match = /^(\d{4})-(\d{1,2})$/.exec(period);
      if (match) return `Wk ${match[2]}, ${match[1]}`;
    }

    if (this.granularity === 'month') {
      const match = /^(\d{4})-(\d{2})$/.exec(period);
      if (match) {
        const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
        return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      }
    }

    return period;
  }
}
