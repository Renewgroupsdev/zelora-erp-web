import { Component, computed, signal, ViewEncapsulation } from '@angular/core';
import { AppointmentsData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** Visit statuses in workflow order, each with its own wave colour. Unknown statuses fall back to grey. */
const STATUSES: { key: string; label: string; color: string }[] = [
  { key: 'scheduled', label: 'Scheduled', color: '#3b82f6' },
  { key: 'in consultation', label: 'In consultation', color: '#ec4899' },
  { key: 'consultation only', label: 'Consultation only', color: '#8b5cf6' },
  { key: 'awaiting terms', label: 'Awaiting terms', color: '#f59e0b' },
  { key: 'invoiced', label: 'Invoiced', color: '#14b8a6' },
  { key: 'converted', label: 'Converted', color: '#16a34a' },
  { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
];
const OTHER_COLOR = '#94a3b8';

interface Series { key: string; label: string; color: string; total: number; values: number[]; line: string; area: string }

/**
 * Today's schedule as one chart: a smooth wave per visit status across the clinic hours, so each stage of the visit
 * (scheduled, in consultation, consultation only, awaiting terms, invoiced, converted, cancelled) reads on its own.
 * The legend chips switch a status's wave on and off.
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
  readonly hidden = signal(new Set<string>());

  /** Today's visits per hour per status (opening hours at least 9 am - 7 pm). */
  private readonly grid = computed(() => {
    const rows = this.data()?.today ?? [];
    const counts = new Map<string, Map<number, number>>();
    const hoursSeen: number[] = [];
    for (const v of rows) {
      const h = Number(/^(\d{1,2}):/.exec(v.time ?? '')?.[1]);
      if (Number.isNaN(h)) continue;
      const key = statusKey(v.status);
      const perHour = counts.get(key) ?? new Map<number, number>();
      perHour.set(h, (perHour.get(h) ?? 0) + 1);
      counts.set(key, perHour);
      hoursSeen.push(h);
    }
    if (!hoursSeen.length) return { hours: [] as number[], counts };
    const from = Math.min(9, ...hoursSeen), to = Math.max(19, ...hoursSeen);
    return { hours: Array.from({ length: to - from + 1 }, (_, i) => from + i), counts };
  });

  readonly series = computed<Series[]>(() => {
    const { hours, counts } = this.grid();
    const known = STATUSES.map(s => s.key);
    const extra = [...counts.keys()].filter(k => !known.includes(k)).map(k => ({ key: k, label: titleCase(k), color: OTHER_COLOR }));
    return [...STATUSES, ...extra].map(s => {
      const values = hours.map(h => counts.get(s.key)?.get(h) ?? 0);
      return { ...s, values, total: values.reduce((a, b) => a + b, 0), line: '', area: '' };
    });
  });

  readonly max = computed(() => Math.max(1, ...this.series().filter(s => !this.hidden().has(s.key)).flatMap(s => s.values)));

  /** Waves for the statuses that have visits and are switched on. */
  readonly visible = computed<Series[]>(() =>
    this.series().filter(s => s.total && !this.hidden().has(s.key)).map(s => ({ ...s, ...wave(s.values.map((v, i) => ({ x: this.x(i), y: this.y(v) })) ) })));

  readonly hours = computed(() => {
    const series = this.series();
    return this.grid().hours.map((h, i) => {
      const label = `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
      const parts = series.filter(s => s.values[i]).map(s => `${s.label} ${s.values[i]}`);
      return { hour: h, label, title: `${label}: ${parts.length ? parts.join(', ') : 'no visits'}` };
    });
  });

  readonly summary = computed(() => 'Today\'s visits by status: ' + this.series().filter(s => s.total).map(s => `${s.label} ${s.total}`).join(', '));

  toggle(key: string): void {
    this.hidden.update(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  x(i: number): number {
    const n = this.grid().hours.length;
    return n > 1 ? (i / (n - 1)) * 100 : 50;
  }

  y(v: number): number {
    return 96 - (v / this.max()) * 86;
  }
}

function statusKey(status: string | null | undefined): string {
  return (status ?? 'unknown').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Smooth line (Catmull-Rom as cubic Béziers) through the points, plus the same line closed down to the baseline. */
function wave(pts: { x: number; y: number }[]): { line: string; area: string } {
  if (!pts.length) return { line: '', area: '' };
  let line = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = Math.min(100, p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = Math.min(100, p2.y - (p3.y - p1.y) / 6);
    line += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return { line, area: `${line} L${pts[pts.length - 1].x} 100 L${pts[0].x} 100 Z` };
}
