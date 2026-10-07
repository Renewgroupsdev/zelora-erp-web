import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Plugin, Tooltip } from 'chart.js';
import { axisShort, chartTicks } from '../../../models/branch-franchise.model';
import { BfColumnDatum, fmt } from '../bf-charts.model';
import { Rgb, cssVar, darken, lighten, rgba, toRgb } from '../bf-charts.util';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/** Geometry of one bar as Chart.js animates it. */
interface BarProps { x: number; y: number; base: number; width: number; }

/**
 * Column chart drawn with Chart.js: one or two series (a = primary, b = comparison, drawn hatched).
 * Chart.js owns the axes, animation and tooltip; a small plugin paints the bars (gradient, rounded top,
 * glow, ring on the latest period) from the animated geometry so they grow in correctly.
 */
@Component({
  selector: 'app-bf-columns',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bf-columns.html',
  styleUrl: './bf-columns.scss',
})
export class BfColumns implements OnDestroy {
  private readonly zone = inject(NgZone);
  private chart?: Chart<'bar'>;
  private canvasEl?: HTMLCanvasElement;

  @ViewChild('cv') set canvas(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvasEl = ref?.nativeElement;
    this.render();
  }

  @Input() set data(value: BfColumnDatum[]) { this._data = value ?? []; this.build(); this.render(); }
  @Input() aName = 'Sales';
  @Input() bName = '';
  @Input() money = false;
  @Input() emptyText = 'No data yet';
  cols: { label: string; a: number; b: number; ratio: number | null }[] = [];
  ticks: number[] = [];
  hasData = false;
  private _data: BfColumnDatum[] = [];

  fmt = (v: number) => fmt(v, this.money);
  axis = (v: number) => (this.money ? axisShort(v) : String(Math.round(v)));

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private build(): void {
    const max = Math.max(...this._data.flatMap(d => [d.a, d.b ?? 0]), 0);
    this.hasData = max > 0;
    this.ticks = chartTicks(max);
    this.cols = this._data.map(d => ({ label: d.label, a: d.a, b: d.b ?? 0, ratio: d.b ? Math.round((d.a / d.b) * 100) : null }));
  }

  private render(): void {
    if (!this.canvasEl || !this.cols.length) {
      if (!this.canvasEl) { this.chart?.destroy(); this.chart = undefined; }
      return;
    }
    if (this.chart && this.chart.canvas !== this.canvasEl) { this.chart.destroy(); this.chart = undefined; }
    const top = this.ticks[this.ticks.length - 1] || 1;
    const step = this.ticks[1] - this.ticks[0] || 1;
    if (this.chart) {
      this.chart.data.labels = this.cols.map(c => c.label);
      this.chart.data.datasets.forEach((ds, i) => (ds.data = this.cols.map(c => (i === 0 ? c.a : c.b))));
      const y = this.chart.options.scales!['y']!;
      y.max = top;
      (y.ticks as { stepSize?: number }).stepSize = step;
      this.chart.update();
      return;
    }

    const muted = cssVar('--text-muted', '#64748b');
    const dark = cssVar('--text-dark', '#0f172a');
    const grid = cssVar('--border-soft', '#e2e8f0');
    const accent = cssVar('--primary-dark', '#0d5c4b');
    const last = this.cols.length - 1;
    const datasets = [{ label: this.aName, data: this.cols.map(c => c.a) }, ...(this.bName ? [{ label: this.bName, data: this.cols.map(c => c.b) }] : [])];

    this.zone.runOutsideAngular(() => {
      this.chart = new Chart(this.canvasEl!, {
        type: 'bar',
        data: {
          labels: this.cols.map(c => c.label),
          // Bars are painted by the plugin below, so the stock fill is transparent.
          datasets: datasets.map(ds => ({ ...ds, backgroundColor: 'transparent', borderWidth: 0, categoryPercentage: 0.78, barPercentage: 0.94, maxBarThickness: 36 })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 18, right: 4 } },
          animation: { duration: 900, easing: 'easeOutQuart', delay: ctx => (ctx.type === 'data' ? ctx.dataIndex * 45 : 0) },
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              grid: { display: false },
              border: { color: grid },
              ticks: {
                color: ctx => (ctx.index === last ? accent : muted),
                font: ctx => ({ size: 10, weight: ctx.index === last ? 'bold' : 'normal' }),
              },
            },
            y: {
              beginAtZero: true,
              max: top,
              grid: { color: grid, tickLength: 0 },
              border: { display: false, dash: [3, 4] },
              ticks: { color: muted, font: { size: 10 }, padding: 8, stepSize: step, callback: v => this.axis(Number(v)) },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f172a',
              titleColor: '#f8fafc',
              bodyColor: '#f8fafc',
              footerColor: '#fbbf24',
              padding: 10,
              cornerRadius: 12,
              boxPadding: 4,
              titleFont: { size: 12.5, weight: 'bold' },
              bodyFont: { size: 12, weight: 500 },
              footerFont: { size: 11, weight: 'bold' },
              callbacks: {
                label: item => ` ${item.dataset.label}: ${this.fmt(item.parsed.y ?? 0)}`,
                labelColor: item => ({ borderColor: 'transparent', backgroundColor: item.datasetIndex === 0 ? '#60a5fa' : '#4ade80', borderRadius: 3 }),
                footer: items => {
                  const ratio = this.cols[items[0].dataIndex]?.ratio;
                  return this.bName && ratio !== null ? `${ratio}% of ${this.bName.toLowerCase()}` : '';
                },
              },
            },
          },
        },
        plugins: [this.barPainter(dark, accent)],
      });
    });
  }

  /** Paints the bars (and a hover band) from the animated element geometry. */
  private barPainter(textColor: string, accent: string): Plugin<'bar'> {
    const colours: Rgb[] = [toRgb('var(--status-blue-text)'), toRgb('var(--status-green-text)')];
    const accentRgb = toRgb(accent);

    return {
      id: 'bfColumnsPaint',
      beforeDatasetsDraw: chart => {
        const active = chart.getActiveElements();
        if (!active.length) return;
        const bars = chart.data.datasets.map((_, d) => (chart.getDatasetMeta(d).data[active[0].index] as unknown as BarElement).getProps(['x', 'width'], true) as unknown as BarProps);
        const left = Math.min(...bars.map(p => p.x - p.width / 2)) - 8;
        const right = Math.max(...bars.map(p => p.x + p.width / 2)) + 8;
        const { top, bottom } = chart.chartArea;
        const g = chart.ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, rgba(accentRgb, 0));
        g.addColorStop(1, rgba(accentRgb, 0.1));
        chart.ctx.fillStyle = g;
        chart.ctx.fillRect(left, top, right - left, bottom - top);
      },
      afterDatasetsDraw: chart => {
        const ctx = chart.ctx;
        const hot = chart.getActiveElements()[0]?.index;
        const lastIndex = this.cols.length - 1;
        chart.data.datasets.forEach((_, d) => {
          const rgb = colours[d % colours.length];
          chart.getDatasetMeta(d).data.forEach((el, i) => {
            const { x, y, base, width } = (el as unknown as BarElement).getProps(['x', 'y', 'base', 'width'], true) as BarProps;
            const h = base - y;
            if (h < 1) return;
            const l = x - width / 2;
            const r = Math.min(7, width / 2, h);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(l, base);
            ctx.lineTo(l, y + r);
            ctx.quadraticCurveTo(l, y, l + r, y);
            ctx.lineTo(l + width - r, y);
            ctx.quadraticCurveTo(l + width, y, l + width, y + r);
            ctx.lineTo(l + width, base);
            ctx.closePath();

            // body: light top, full colour in the middle, deeper base, with a soft glow above
            const body = ctx.createLinearGradient(0, y, 0, base);
            body.addColorStop(0, rgba(lighten(rgb, 0.28), 1));
            body.addColorStop(0.55, rgba(rgb, 1));
            body.addColorStop(1, rgba(darken(rgb, 0.12), 1));
            ctx.fillStyle = body;
            ctx.fill();

            ctx.clip();
            // left-edge sheen
            const sheen = ctx.createLinearGradient(l, 0, l + width, 0);
            sheen.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
            sheen.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = sheen;
            ctx.fillRect(l, y, width, h);
            // comparison series: fine diagonal hatching
            if (d === 1) {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
              ctx.lineWidth = 3;
              for (let k = -h; k < width + h; k += 8) {
                ctx.beginPath();
                ctx.moveTo(l + k, base);
                ctx.lineTo(l + k + h, y);
                ctx.stroke();
              }
            }
            if (hot === i) { ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'; ctx.fillRect(l, y, width, h); }
            ctx.restore();

            // ring on the latest period of the primary series
            if (d === 0 && i === lastIndex) {
              ctx.save();
              ctx.strokeStyle = rgba(accentRgb, 0.95);
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.roundRect(l - 1.5, y - 1.5, width + 3, h + 1.5, [r + 1.5, r + 1.5, 0, 0]);
              ctx.stroke();
              ctx.restore();
            }

            // value above each bar when there is room for it
            if (this.cols.length <= 8 && width >= 20) {
              ctx.save();
              ctx.fillStyle = textColor;
              ctx.font = '700 10px Inter, system-ui, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(this.axis(d === 0 ? this.cols[i].a : this.cols[i].b), x, y - 5);
              ctx.restore();
            }
          });
        });
      },
    };
  }
}
