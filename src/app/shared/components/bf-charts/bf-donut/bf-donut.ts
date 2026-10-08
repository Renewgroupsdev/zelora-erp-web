import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { ArcElement, Chart, DoughnutController } from 'chart.js';
import { BF_PALETTE, BfDatum, fmt } from '../bf-charts.model';
import { Rgb, RingGeometry, cssVar, darken, fit, lighten, rgba, toRgb } from '../bf-charts.util';

Chart.register(DoughnutController, ArcElement);

/**
 * Pie infographic drawn with Chart.js: big gradient wedges that reach further the larger their value,
 * share and name printed inside, a bevelled centre disc, and a pop-out + dim effect on hover.
 */
@Component({
  selector: 'app-bf-donut',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bf-donut.html',
  styleUrl: './bf-donut.scss',
})
export class BfDonut implements OnDestroy {
  private readonly zone = inject(NgZone);
  private chart?: Chart<'doughnut'>;
  private canvasEl?: HTMLCanvasElement;

  @ViewChild('cv') set canvas(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvasEl = ref?.nativeElement;
    this.render();
  }

  @Input() set data(value: BfDatum[]) { this._data = (value ?? []).filter(d => d.value > 0); this.build(); this.render(); }
  @Input() centerLabel = 'Total';
  @Input() money = false;
  @Input() emptyText = 'No data yet';
  hover: number | null = null;
  total = 0;
  segments: { label: string; value: number; pct: number; color: string; rgb: Rgb }[] = [];
  private _data: BfDatum[] = [];

  fmt = (v: number) => fmt(v, this.money);

  /** Legend hover drives the same pop-out as hovering the wedge itself. */
  setHover(index: number | null): void {
    if (this.hover === index) return;
    this.hover = index;
    this.syncChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private build(): void {
    this.total = this._data.reduce((s, d) => s + d.value, 0);
    this.hover = null;
    this.segments = this._data.map((d, i) => {
      const color = BF_PALETTE[i % BF_PALETTE.length];
      return { label: d.label, value: d.value, pct: Math.round((d.value / this.total) * 100), color, rgb: toRgb(color) };
    });
  }

  private syncChart(): void {
    if (!this.chart) return;
    this.chart.setActiveElements(this.hover === null ? [] : [{ datasetIndex: 0, index: this.hover }]);
    this.chart.update('none');
  }

  /** Reach of wedge `i` as a share of the full radius: the biggest value goes all the way out, the smallest stays at ~84%. */
  private reach(i: number): number {
    const max = Math.max(...this.segments.map(s => s.value), 1);
    return 0.84 + 0.16 * (this.segments[i].value / max) + (this.hover === i ? 0.03 : 0);
  }

  private render(): void {
    if (!this.canvasEl || !this.segments.length) {
      if (!this.canvasEl) { this.chart?.destroy(); this.chart = undefined; }
      return;
    }
    if (this.chart && this.chart.canvas !== this.canvasEl) { this.chart.destroy(); this.chart = undefined; }
    if (this.chart) {
      this.chart.data.labels = this.segments.map(s => s.label);
      this.chart.data.datasets[0].data = this.segments.map(s => s.value);
      this.chart.update();
      return;
    }
    const surface = cssVar('--app-surface-solid', '#ffffff');
    this.zone.runOutsideAngular(() => {
      this.chart = new Chart(this.canvasEl!, {
        type: 'doughnut',
        data: {
          labels: this.segments.map(s => s.label),
          datasets: [{
            data: this.segments.map(s => s.value),
            // Radial gradient per wedge (light near the centre, deeper at the rim); the others fade while one is hovered.
            backgroundColor: ctx => {
              const seg = this.segments[ctx.dataIndex];
              if (!seg) return 'transparent';
              const alpha = this.hover !== null && this.hover !== ctx.dataIndex ? 0.38 : 1;
              const geo = ctx.chart.getDatasetMeta(0).controller as unknown as RingGeometry;
              const area = ctx.chart.chartArea;
              if (!geo || !area || !geo.outerRadius) return rgba(seg.rgb, alpha);
              const cx = (area.left + area.right) / 2;
              const cy = (area.top + area.bottom) / 2;
              const g = ctx.chart.ctx.createRadialGradient(cx, cy, geo.innerRadius, cx, cy, geo.outerRadius);
              g.addColorStop(0, rgba(lighten(seg.rgb, 0.38), alpha));
              g.addColorStop(1, rgba(darken(seg.rgb, 0.1), alpha));
              return g;
            },
            borderColor: surface,
            borderWidth: 1.5,
            borderRadius: 0,
            spacing: 0,
            hoverOffset: 12,
            hoverBorderColor: surface,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '42%',
          layout: { padding: 14 },
          animation: { duration: 1000, easing: 'easeOutQuart' },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          onHover: (event, elements) => {
            const index = elements.length ? elements[0].index : null;
            const target = event.native?.target as HTMLElement | null;
            if (target) target.style.cursor = index === null ? 'default' : 'pointer';
            if (index !== this.hover) this.zone.run(() => { this.hover = index; this.chart?.update('none'); });
          },
        },
        plugins: [{
          id: 'bfPie',
          // Give each wedge its own reach and a soft drop shadow, like the layered pieces in the reference.
          beforeDatasetDraw: chart => {
            const geo = chart.getDatasetMeta(0).controller as unknown as RingGeometry;
            chart.getDatasetMeta(0).data.forEach((arc, i) => {
              if (!this.segments[i]) return;
              (arc as unknown as RingGeometry).outerRadius = Math.max(geo.innerRadius + 8, geo.outerRadius * this.reach(i));
            });
            chart.ctx.save();
            chart.ctx.shadowColor = 'rgba(15, 23, 42, 0.32)';
            chart.ctx.shadowBlur = 16;
            chart.ctx.shadowOffsetY = 5;
          },
          afterDatasetDraw: chart => chart.ctx.restore(),
          // Share and (when it fits) the name inside each wedge, in white.
          afterDatasetsDraw: chart => {
            const ctx = chart.ctx;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            chart.getDatasetMeta(0).data.forEach((arc, i) => {
              const seg = this.segments[i];
              if (!seg || seg.pct < 5) return;
              const p = arc.tooltipPosition(true);
              if (p.x === null || p.y === null) return;
              ctx.globalAlpha = this.hover !== null && this.hover !== i ? 0.55 : 1;
              ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
              ctx.shadowBlur = 4;
              ctx.fillStyle = '#fff';
              // Room the wedge really has at its middle: arc length along the ring, or about 1.5x its thickness.
              const g = arc as unknown as { startAngle: number; endAngle: number; innerRadius: number; outerRadius: number };
              const room = Math.min((g.endAngle - g.startAngle) * ((g.innerRadius + g.outerRadius) / 2), (g.outerRadius - g.innerRadius) * 1.5) - 10;
              ctx.font = '600 8.5px Inter, system-ui, sans-serif';
              const name = fit(ctx, seg.label.toUpperCase(), room);
              ctx.font = '800 13px Inter, system-ui, sans-serif';
              ctx.fillText(`${seg.pct}%`, p.x, p.y - (name ? 6 : 0));
              if (name) {
                ctx.font = '600 8.5px Inter, system-ui, sans-serif';
                ctx.fillText(name, p.x, p.y + 8);
              }
            });
            ctx.restore();
          },
        }],
      });
    });
  }
}
