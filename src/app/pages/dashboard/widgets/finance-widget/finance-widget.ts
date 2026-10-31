import { Component, computed, effect, ElementRef, signal, viewChild, ViewEncapsulation } from '@angular/core';
import { FinanceData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';
import { axisLabel, niceScale, pointLabel, smoothPath } from '../dash-chart.util';

type Series = 'income' | 'expense';

/** Chart canvas: the width follows the card (1 unit = 1 px, so text keeps its size), the height is fixed. */
const DEFAULT_W = 440;
const MIN_W = 260;
const H = 220;
const PAD = { l: 40, r: 18, t: 44, b: 36 };
const BUBBLE_W = 58;

interface Marker { i: number; x: number; y: number; bx: number; label: string; primary: boolean; }

/**
 * Income vs expense: the 6-month trend as a smooth area chart (switch between income and expense), a key insight
 * line, and the period's headline figures. Manager roles only.
 */
@Component({
  selector: 'app-finance-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './finance-widget.html',
  styleUrl: './finance-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class FinanceWidget extends DashWidget<FinanceData> {
  protected readonly key = 'finance' as const;

  readonly height = H;
  readonly baseline = H - PAD.b;
  readonly plotLeft = PAD.l;

  readonly active = signal<Series>('income');
  readonly hover = signal<number | null>(null);

  /** The element the chart is drawn into; its measured width is the chart's width. */
  private readonly plot = viewChild<ElementRef<HTMLElement>>('plot');
  readonly width = signal(DEFAULT_W);
  readonly plotRight = computed(() => this.width() - PAD.r);

  constructor() {
    super();
    effect(onCleanup => {
      const el = this.plot()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => this.width.set(Math.max(MIN_W, Math.round(entry.contentRect.width))));
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });
  }

  private readonly trend = computed(() => this.data()?.trend ?? []);

  /** True once any month has income or expense, so a brand-new business sees a message instead of a flat line. */
  readonly hasData = computed(() => this.trend().some(t => t.income > 0 || t.expense > 0));

  readonly chart = computed(() => {
    const trend = this.trend();
    const key = this.active();
    const values = trend.map(t => t[key]);
    const { top, ticks } = niceScale(Math.max(0, ...values));
    const w = this.width();
    const iw = w - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const n = trend.length;

    const pts = trend.map((t, i) => ({
      x: n === 1 ? PAD.l + iw / 2 : PAD.l + (iw * i) / (n - 1),
      y: PAD.t + ih - (Math.max(0, t[key]) / top) * ih,
      v: t[key],
      label: t.label,
    }));

    const line = smoothPath(pts);
    const area = pts.length ? `${line} L${pts[pts.length - 1].x},${H - PAD.b} L${pts[0].x},${H - PAD.b} Z` : '';
    const max = Math.max(0, ...values);
    const peak = max > 0 ? values.indexOf(max) : -1;

    return {
      pts, line, area, peak, last: n - 1,
      grid: ticks.map(v => ({ v, y: PAD.t + ih - (v / top) * ih, label: axisLabel(v) })),
    };
  });

  /** The bubbles on the chart: the hovered month, or the peak; plus the latest month when it is a different one. */
  readonly markers = computed<Marker[]>(() => {
    const c = this.chart();
    if (!c.pts.length) return [];
    const w = this.width();
    const main = this.hover() ?? c.peak;
    const idx = [main, c.last].filter((v, k, a) => v >= 0 && a.indexOf(v) === k);
    return idx.map(i => {
      const p = c.pts[i];
      return {
        i, x: p.x, y: p.y, label: pointLabel(p.v), primary: i === main,
        // Keep the bubble inside the chart, with its pointer still on the dot.
        bx: Math.min(Math.max(p.x - BUBBLE_W / 2, 4), w - BUBBLE_W - 4),
      };
    });
  });

  readonly bubbleWidth = BUBBLE_W;

  readonly insight = computed(() => {
    const c = this.chart();
    if (c.peak < 0 || c.pts.length < 2) return null;
    const row = this.trend()[c.peak];
    const month = this.monthName(row.key, row.label);
    const amount = this.inrShort(c.pts[c.peak].v);
    return this.active() === 'income'
      ? { month, amount, text: `reached a peak of`, tail: 'the highest of the last ' + c.pts.length + ' months.', what: 'collections' }
      : { month, amount, text: `peaked at`, tail: 'the highest of the last ' + c.pts.length + ' months.', what: 'expenses' };
  });

  setHover(i: number | null): void {
    this.hover.set(i);
  }

  abs(change: number): string {
    return Math.abs(change).toFixed(1).replace(/\.0$/, '');
  }

  private monthName(key: string, fallback: string): string {
    const d = new Date(`${key}-01T00:00:00`);
    return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString('en-IN', { month: 'long' });
  }
}
