import { AfterViewInit, Component, ElementRef, Input, OnDestroy, Renderer2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';

/**
 * Heartbeat loader shown while records load.
 *
 * Two modes:
 * - `contained` (default: false / full-screen): the host element is moved onto <body> so no
 *   parent stacking context (z-index / transform) can trap the fixed overlay inside a page.
 * - `[contained]="true"`: stays put and covers its own (`position: relative`) parent instead,
 *   e.g. just a table's scroll area while a page of rows loads, leaving the rest of the page
 *   (filters, pagination controls, header) usable.
 */
@Component({
  selector: 'app-page-loader',
  standalone: true,
  templateUrl: './page-loader.html',
  styleUrl: './page-loader.scss',
})
export class PageLoader implements AfterViewInit, OnDestroy {
  @Input() contained = false;

  private host = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);
  private document = inject(DOCUMENT);

  ngAfterViewInit(): void {
    if (!this.contained) {
      this.renderer.appendChild(this.document.body, this.host.nativeElement);
    }
  }

  ngOnDestroy(): void {
    if (!this.contained) this.host.nativeElement.remove();
  }
}
