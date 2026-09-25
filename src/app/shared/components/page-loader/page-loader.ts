import { AfterViewInit, Component, ElementRef, OnDestroy, Renderer2 } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';

/**
 * Full-screen heartbeat loader that blurs the whole site while records load.
 * The host element is moved onto <body> so no parent stacking context
 * (z-index / transform) can trap the fixed overlay inside a page.
 */
@Component({
  selector: 'app-page-loader',
  standalone: true,
  templateUrl: './page-loader.html',
  styleUrl: './page-loader.scss',
})
export class PageLoader implements AfterViewInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);
  private document = inject(DOCUMENT);

  ngAfterViewInit(): void {
    this.renderer.appendChild(this.document.body, this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.host.nativeElement.remove();
  }
}
