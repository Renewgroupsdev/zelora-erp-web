import { ChangeDetectionStrategy, Component, ElementRef, OnChanges, OnDestroy, SimpleChanges, ViewChild, input } from '@angular/core';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

Chart.register(...registerables);

/** Thin chart.js wrapper: the page hands it real aggregated rows, it only draws them. */
@Component({
  selector: 'app-audit-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="au-chart"><canvas #canvas role="img" [attr.aria-label]="label()"></canvas></div>`,
  styleUrls: ['./audit.scss'],
})
export class AuditChart implements OnChanges, OnDestroy {
  readonly type = input.required<ChartType>();
  readonly labels = input.required<string[]>();
  readonly datasets = input.required<ChartConfiguration['data']['datasets']>();
  readonly label = input('Chart');
  readonly stacked = input(false);
  readonly horizontal = input(false);

  @ViewChild('canvas', { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;
  private chart: Chart | null = null;

  ngOnChanges(_: SimpleChanges): void {
    this.chart?.destroy();
    const circular = this.type() === 'doughnut' || this.type() === 'pie';
    this.chart = new Chart(this.canvas.nativeElement, {
      type: this.type(),
      data: { labels: this.labels(), datasets: this.datasets() },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: this.horizontal() ? 'y' : 'x',
        datasets: { bar: { maxBarThickness: 42, borderRadius: 4 } },
        plugins: { legend: { display: circular || this.datasets().length > 1, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: circular ? {} : {
          x: { stacked: this.stacked(), grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true } },
          y: { stacked: this.stacked(), beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } },
        },
      },
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
