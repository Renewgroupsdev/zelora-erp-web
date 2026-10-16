import { Component, Input, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

interface OrbitIcon {
  icon: string;
  angle: number;
  tone: 'green' | 'teal' | 'gold' | 'rose';
}

/**
 * "Work in progress / coming soon" card for a tab whose page or section isn't built yet. Used full height by the
 * Work in progress page (route tabs) and `compact` inside a details page's tab body (in-page tabs).
 */
@Component({
  selector: 'app-wip-panel',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './wip-panel.html',
  styleUrl: './wip-panel.scss',
})
export class WipPanel {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  /** Tab name shown in "<label> is coming soon". */
  @Input() label = '';
  /** Smaller variant that fits inside another page's panel instead of filling the layout. */
  @Input() compact = false;

  /** Healthcare icons spaced evenly around the illustration. */
  readonly orbitIcons: OrbitIcon[] = [
    { icon: 'bi-heart-pulse-fill', angle: 0, tone: 'rose' },
    { icon: 'bi-capsule', angle: 60, tone: 'gold' },
    { icon: 'bi-clipboard2-pulse-fill', angle: 120, tone: 'teal' },
    { icon: 'bi-droplet-half', angle: 180, tone: 'green' },
    { icon: 'bi-shield-plus', angle: 240, tone: 'teal' },
    { icon: 'bi-stars', angle: 300, tone: 'gold' },
  ];

  /** Gentle 3D tilt of the illustration towards the pointer (degrees). */
  tiltX = 0;
  tiltY = 0;

  onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    this.tiltY = +(x * 10).toFixed(2);
    this.tiltX = +(-y * 8).toFixed(2);
  }

  onPointerLeave(): void {
    this.tiltX = 0;
    this.tiltY = 0;
  }

  /** Back to the page the user came from; the dashboard when this page was opened directly (no in-app history). */
  goBack(): void {
    if (this.router.lastSuccessfulNavigation?.previousNavigation) {
      this.location.back();
    } else {
      this.router.navigateByUrl('/app/dashboard');
    }
  }
}
