import { Component, computed, signal, ViewEncapsulation } from '@angular/core';
import { LeadsData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

interface SourceSlice {
  label: string; value: number; pct: string; share: number; color: string; light: string; icon: string;
  /** SVG ring geometry: visible arc length and where it starts, in ring units. */
  arc: number; start: number;
  /** Where the share label sits on the wedge (viewBox units); null when the wedge is too thin to hold it. */
  lx: number | null; ly: number;
}

/** [light, base] per wedge: the wedge is a light-to-base gradient around the ring, like the reference. */
const COLORS: [string, string][] = [
  ['#4da3ff', '#1f6fe5'], ['#b57bff', '#8a3df0'], ['#6f7dff', '#3a47d8'], ['#ffb04d', '#f5760a'], ['#5fe08c', '#1fae5b'],
  ['#3fd8e0', '#0fa9b8'], ['#ff7ab8', '#e0338a'], ['#ffd84d', '#d9a406'], ['#ff7a8a', '#e0304a'],
];
const OTHER: [string, string] = ['#b4bfce', '#8393a9'];
/** More sources than this and the smallest ones are grouped as "Other sources" so the list stays readable. */
const MAX_ROWS = 7;

const R = 70;
const STROKE = 42;
const CIRC = 2 * Math.PI * R;
const GAP = 2.4;
/** Wedges smaller than this share of the ring do not get a label inside. */
const MIN_LABEL_SHARE = 0.045;

/** Where the period's leads came from (same endpoint as the lead funnel; the API caches it for a minute). */
@Component({
  selector: 'app-lead-source-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './lead-source-widget.html',
  styleUrl: './lead-source-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class LeadSourceWidget extends DashWidget<LeadsData> {
  protected readonly key = 'leads' as const;

  readonly circumference = CIRC;
  readonly radius = R;
  readonly stroke = STROKE;
  readonly hover = signal<number | null>(null);

  readonly total = computed(() => (this.data()?.by_source ?? []).reduce((s, d) => s + d.value, 0));

  readonly slices = computed<SourceSlice[]>(() => {
    const rows = [...(this.data()?.by_source ?? [])].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, d) => s + d.value, 0);
    if (!total) return [];

    let shown = rows;
    if (rows.length > MAX_ROWS) {
      const rest = rows.slice(MAX_ROWS - 1);
      shown = [...rows.slice(0, MAX_ROWS - 1), { label: 'Other sources', value: rest.reduce((s, d) => s + d.value, 0) }];
    }

    let from = 0;
    return shown.map((d, i) => {
      const share = d.value / total;
      const length = share * CIRC;
      const [light, color] = d.label === 'Other sources' ? OTHER : COLORS[i % COLORS.length];
      // Middle of the wedge, measured from 12 o'clock (the ring is drawn rotated by -90deg).
      const mid = ((from + length / 2) / CIRC) * 2 * Math.PI - Math.PI / 2;
      const slice: SourceSlice = {
        label: d.label, value: d.value, share, pct: this.percent(share), color, light,
        icon: this.iconFor(d.label),
        // A hairline gap between wedges (none when there is only one), so they read as separate pieces.
        arc: shown.length > 1 ? Math.max(length - GAP, 0.5) : length,
        start: from,
        lx: share >= MIN_LABEL_SHARE ? 100 + R * Math.cos(mid) : null,
        ly: 100 + R * Math.sin(mid),
      };
      from += length;
      return slice;
    });
  });

  readonly shown = computed(() => {
    const i = this.hover();
    const s = this.slices();
    return i !== null && s[i] ? { value: s[i].value, label: s[i].label } : { value: this.total(), label: 'Total leads' };
  });

  setHover(i: number | null): void {
    this.hover.set(i);
  }

  count(v: number): string {
    return v.toLocaleString('en-IN');
  }

  private percent(share: number): string {
    return (share * 100).toFixed(1).replace(/\.0$/, '');
  }

  /** Bootstrap icon for a source by name; a neutral target for names we do not know. */
  private iconFor(label: string): string {
    const n = label.toLowerCase();
    const map: [RegExp, string][] = [
      [/facebook|meta/, 'bi-facebook'], [/instagram/, 'bi-instagram'], [/google/, 'bi-google'], [/whatsapp/, 'bi-whatsapp'],
      [/youtube/, 'bi-youtube'], [/website|web|online|enquiry form/, 'bi-globe2'], [/refer/, 'bi-people-fill'],
      [/walk/, 'bi-person-walking'], [/news|paper|print/, 'bi-newspaper'], [/call|phone|tele/, 'bi-telephone-fill'],
      [/other/, 'bi-three-dots'],
    ];
    return map.find(([re]) => re.test(n))?.[1] ?? 'bi-bullseye';
  }
}
