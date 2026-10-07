import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, signal } from '@angular/core';

/**
 * Horizontal scroller helper for tab bars: tracks whether there is more to the left / right so arrow
 * buttons can show, scrolls by about 70% of the width on request and keeps a clicked tab in view.
 * Use as `<div appHScroll #hs="appHScroll">` and bind `hs.canLeft()`, `hs.canRight()`, `hs.scrollBy(±1)`.
 */
@Directive({ selector: '[appHScroll]', standalone: true, exportAs: 'appHScroll' })
export class HScroll implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private observer?: ResizeObserver;

  readonly canLeft = signal(false);
  readonly canRight = signal(false);

  private readonly onScroll = () => this.update();
  private readonly onClick = (event: Event) => {
    (event.target as HTMLElement).closest('button')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  };

  ngOnInit(): void {
    this.el.addEventListener('scroll', this.onScroll, { passive: true });
    this.el.addEventListener('click', this.onClick);
    // Layout changes (window resize, tabs added) never fire `scroll`, so watch the size too.
    this.zone.runOutsideAngular(() => {
      this.observer = new ResizeObserver(() => this.zone.run(() => this.update()));
      this.observer.observe(this.el);
    });
    queueMicrotask(() => this.update());
  }

  ngOnDestroy(): void {
    this.el.removeEventListener('scroll', this.onScroll);
    this.el.removeEventListener('click', this.onClick);
    this.observer?.disconnect();
  }

  scrollBy(direction: 1 | -1): void {
    this.el.scrollBy({ left: direction * Math.max(160, this.el.clientWidth * 0.7), behavior: 'smooth' });
  }

  private update(): void {
    const max = this.el.scrollWidth - this.el.clientWidth;
    this.canLeft.set(this.el.scrollLeft > 4);
    this.canRight.set(this.el.scrollLeft < max - 4);
  }
}
