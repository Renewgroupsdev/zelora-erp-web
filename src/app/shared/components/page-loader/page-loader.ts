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
 * - `[content]="true"`: blurs the whole page area to the right of the sidebar (below the top
 *   navbar). The host is moved into the layout's `.content-shell`; sidebar and header stay usable.
 *   Falls back to full-screen when no `.content-shell` exists.
 */
@Component({
  selector: 'app-page-loader',
  standalone: true,
  templateUrl: './page-loader.html',
  styleUrl: './page-loader.scss',
})
export class PageLoader implements AfterViewInit, OnDestroy {
  @Input() contained = false;
  @Input() content = false;

  private host = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);
  private document = inject(DOCUMENT);
  private moved = false;

  ngAfterViewInit(): void {
    if (this.contained) return;

    const shell = this.content ? this.document.querySelector('.content-shell') : null;
    if (shell) this.renderer.addClass(this.host.nativeElement, 'in-content');
    this.renderer.appendChild(shell ?? this.document.body, this.host.nativeElement);
    this.moved = true;
  }

  ngOnDestroy(): void {
    if (this.moved) this.host.nativeElement.remove();
  }
}
