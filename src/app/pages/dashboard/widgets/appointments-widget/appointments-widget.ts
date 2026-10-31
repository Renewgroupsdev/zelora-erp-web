import { Component, computed, effect, ElementRef, signal, viewChild, ViewEncapsulation } from '@angular/core';
import { AppointmentsData } from '../../../../shared/models/dashboard.model';
import { axisLabel, niceScale, smoothPath } from '../dash-chart.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** Visit statuses in workflow order, each with its own line colour. Unknown statuses fall back to grey. */
const STATUSES: { key: string; label: string; color: string }[] = [
  { key: 'scheduled', label: 'Scheduled', color: '#2f7bf5' },
  { key: 'in consultation', label: 'In consultation', color: '#ec4899' },
  { key: 'consultation only', label: 'Consultation only', color: '#8b5cf6' },
  { key: 'awaiting terms', label: 'Awaiting terms', color: '#f59e0b' },
  { key: 'invoiced', label: 'Invoiced', color: '#14b8a6' },
  { key: 'converted', label: 'Converted', color: '#16a34a' },
  { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
];
const OTHER_COLOR = '#94a3b8';

/** Chart canvas: the width follows the card (1 unit = 1 px, so text keeps its size), the height is fixed. */
const DEFAULT_W = 440;
const MIN_W = 260;
const H = 210;
const PAD = { l: 34, r: 16, t: 18, b: 34 };
const TIP_W = 168;

interface Point { x: number; y: number; v: number }
interface StatusLine { key: string; label: string; color: string; total: number; values: number[]; pts: Point[]; line: string; area: string }

/**
 * Today's schedule as a smooth line per visit status across the clinic hours (9 am - 7 pm at least), each status in its
 * own colour. The legend switches a status on and off; hovering an hour opens a card with that hour's visits by
 * status; a line below the chart names the busiest hour.
 */
@Component({
  selector: 'app-appointments-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './appointments-widget.html',
  styleUrl: './appointments-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class AppointmentsWidget extends DashWidget<AppointmentsData> {
  protected readonly key = 'appointments' as const;

  readonly height = H;
  readonly baseline = H - PAD.b;
  readonly plotLeft = PAD.l;
  readonly plotTop = PAD.t;

  readonly hidden = signal(new Set<string>());
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

  /** Today's visits per hour per status (opening hours at least 9 am - 7 pm). */
  private readonly grid = computed(() => {
    const counts = new Map<string, Map<number, number>>();
    const seen: number[] = [];
    for (const v of this.data()?.today ?? []) {
      const h = Number(/^(\d{1,2}):/.exec(v.time ?? '')?.[1]);
      if (Number.isNaN(h)) continue;
      const status = statusKey(v.status);
      const perHour = counts.get(status) ?? new Map<number, number>();
      perHour.set(h, (perHour.get(h) ?? 0) + 1);
      counts.set(status, perHour);
      seen.push(h);
    }
    if (!seen.length) return { hours: [] as number[], counts };
    const from = Math.min(9, ...seen);
    const to = Math.max(19, ...seen);
    return { hours: Array.from({ length: to - from + 1 }, (_, i) => from + i), counts };
  });

  readonly hours = computed(() => this.grid().hours.map(h => ({ hour: h, label: hourLabel(h) })));

  /** Every visit status, in workflow order (plus any other status seen today), with its count per hour; zero when it has no visits. */
  readonly series = computed(() => {
    const { hours, counts } = this.grid();
    const known = STATUSES.map(s => s.key);
    const extra = [...counts.keys()].filter(k => !known.includes(k)).map(k => ({ key: k, label: titleCase(k), color: OTHER_COLOR }));
    return [...STATUSES, ...extra].map(s => {
      const values = hours.map(h => counts.get(s.key)?.get(h) ?? 0);
      return { ...s, values, total: values.reduce((a, b) => a + b, 0) };
    });
  });

  readonly total = computed(() => this.series().reduce((sum, s) => sum + s.total, 0));

  readonly chart = computed(() => {
    const hours = this.grid().hours;
    const lines = this.series().filter(s => !this.hidden().has(s.key));
    const { top, ticks } = niceScale(Math.max(0, ...lines.flatMap(s => s.values)), true);
    const iw = this.width() - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const n = hours.length;
    const xAt = (i: number) => (n === 1 ? PAD.l + iw / 2 : PAD.l + (iw * i) / (n - 1));

    // Statuses without visits are drawn first (flat on the axis), so the busy ones sit on top of them.
    const drawn: StatusLine[] = [...lines].sort((a, b) => Number(a.total > 0) - Number(b.total > 0)).map(s => {
      const pts = s.values.map((v, i) => ({ x: xAt(i), y: PAD.t + ih - (v / top) * ih, v }));
      const line = smoothPath(pts);
      return { ...s, pts, line, area: pts.length ? `${line} L${pts[pts.length - 1].x},${H - PAD.b} L${pts[0].x},${H - PAD.b} Z` : '' };
    });

    return {
      drawn,
      xs: hours.map((_, i) => xAt(i)),
      step: n > 1 ? iw / (n - 1) : iw,
      ih,
      grid: ticks.map(v => ({ v, y: PAD.t + ih - (v / top) * ih, label: axisLabel(v) })),
    };
  });

  /** The card for the hour under the pointer: its visits by status. */
  readonly tip = computed(() => {
    const i = this.hover();
    const c = this.chart();
    if (i === null || c.xs[i] === undefined) return null;
    const items = this.series().filter(s => s.values[i] > 0).map(s => ({ label: s.label, color: s.color, value: s.values[i], hidden: this.hidden().has(s.key) }));
    const total = items.reduce((sum, it) => sum + it.value, 0);
    return {
      i, x: c.xs[i], hour: longHour(this.grid().hours[i]), items, total,
      // The card sits beside the guide line, flipping to its left near the right edge.
      left: c.xs[i] + TIP_W + 14 > this.width() ? Math.max(c.xs[i] - TIP_W - 10, 0) : c.xs[i] + 10,
    };
  });

  readonly insight = computed(() => {
    const { hours, counts } = this.grid();
    if (!hours.length) return null;
    const perHour = hours.map((_, i) => [...counts.values()].reduce((sum, m) => sum + (m.get(hours[i]) ?? 0), 0));
    const max = Math.max(...perHour);
    return max > 0 ? { hour: longHour(hours[perHour.indexOf(max)]), visits: max } : null;
  });

  readonly summary = computed(() => 'Today\'s visits by status: ' + this.series().filter(s => s.total).map(s => `${s.label} ${s.total}`).join(', '));

  toggle(key: string): void {
    this.hidden.update(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  setHover(i: number | null): void {
    this.hover.set(i);
  }
}

function statusKey(status: string | null | undefined): string {
  return (status ?? 'unknown').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 9 -> 9a, 13 -> 1p */
function hourLabel(h: number): string {
  return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
}

/** 9 -> 9 AM, 13 -> 1 PM */
function longHour(h: number): string {
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}
