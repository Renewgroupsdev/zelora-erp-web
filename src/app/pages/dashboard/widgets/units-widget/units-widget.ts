import { Component, computed, effect, ElementRef, signal, viewChild, ViewEncapsulation } from '@angular/core';
import { UnitsData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/**
 * Every branch and franchise for the period as a card: its photo, collections, share, leads, visits and new customers.
 * The cards sit in one row; Previous / Next in the card header move along it when they do not all fit.
 */
@Component({
  selector: 'app-units-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './units-widget.html',
  styleUrl: './units-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class UnitsWidget extends DashWidget<UnitsData> {
  protected readonly key = 'units' as const;

  readonly units = computed(() => {
    const d = this.data();
    const total = d?.total_revenue ?? 0;
    return [...(d?.units ?? [])]
      .sort((a, b) => b.revenue - a.revenue)
      .map(u => ({ ...u, share: total > 0 ? ((u.revenue / total) * 100).toFixed(1).replace(/\.0$/, '') : '0' }));
  });

  /** The row of cards; Previous / Next only show while some of it is out of view. */
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  readonly canPrev = signal(false);
  readonly canNext = signal(false);
  /** Photos that failed to load fall back to the building icon. */
  readonly broken = signal(new Set<string>());

  constructor() {
    super();
    effect(onCleanup => {
      const el = this.track()?.nativeElement;
      this.units();
      if (!el) return;
      const update = () => this.measure();
      el.addEventListener('scroll', update, { passive: true });
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
      observer?.observe(el);
      // The cards are laid out after this effect runs; measure once they are.
      queueMicrotask(update);
      onCleanup(() => { el.removeEventListener('scroll', update); observer?.disconnect(); });
    });
  }

  /** Moves one page of cards (the visible width) along the row. */
  scroll(direction: 1 | -1): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth - 40, 160), behavior: 'smooth' });
  }

  photoFailed(key: string): void {
    this.broken.update(set => new Set(set).add(key));
  }

  private measure(): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    this.canPrev.set(el.scrollLeft > 4);
    this.canNext.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }
}
