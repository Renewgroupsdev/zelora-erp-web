import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DetailCardIconVariant, DetailTrendDirection } from '../../models/common-components.model';

interface SparklinePaths {
  line: string;
  area: string;
}

@Component({
  selector: 'app-common-detail-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './common-detail-card.html',
  styleUrl: './common-detail-card.scss',
})
export class CommonDetailCard {
  private static nextId = 0;

  @Input() label = '';
  @Input() value: string | number = '';
  @Input() trendText?: string;
  @Input() trendDirection: DetailTrendDirection = 'neutral';
  @Input() hero = false;
  @Input() icon?: string;
  @Input() iconVariant: DetailCardIconVariant = 'primary';
  @Input() sparkline?: number[];

  // Each card renders its own <linearGradient>, so the fill needs an id unique to this instance.
  readonly sparkGradientId = `detail-spark-${CommonDetailCard.nextId++}`;

  get sparklinePaths(): SparklinePaths {
    const points = this.sparkline ?? [];
    if (points.length < 2) return { line: '', area: '' };

    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const top = 2;
    const bottom = 30;

    const coords = points.map((point, index) => ({
      x: (index / (points.length - 1)) * 100,
      y: bottom - ((point - min) / range) * (bottom - top),
    }));

    // Smooth the polyline into a curve by running a quadratic Bezier through
    // each segment's midpoint, matching the wavy sparkline look in the design.
    let line = `M ${coords[0].x},${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      line += ` Q ${curr.x},${curr.y} ${midX},${midY}`;
    }
    const last = coords[coords.length - 1];
    line += ` T ${last.x},${last.y}`;

    const area = `${line} L ${last.x},32 L ${coords[0].x},32 Z`;

    return { line, area };
  }
}
