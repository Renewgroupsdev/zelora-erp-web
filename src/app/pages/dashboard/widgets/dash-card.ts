import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Frame of one dashboard section: icon + title + subtitle, an optional "Open" drill-down link, and the loading
 * (skeleton), error (retry) and empty states. The section's content is projected; extra header controls go in
 * `[card-actions]`.
 */
@Component({
  selector: 'app-dash-card',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="dash-card" [class.is-refreshing]="refreshing()" [attr.aria-busy]="loading() || refreshing()">
      <header class="dash-card-head">
        <span class="dash-card-icon" [class]="'tone-' + tone()"><i class="bi" [class]="icon()" aria-hidden="true"></i></span>
        <div class="dash-card-title">
          <h2>{{ title() }}</h2>
          @if (subtitle()) { <p>{{ subtitle() }}</p> }
        </div>
        <div class="dash-card-actions">
          <ng-content select="[card-actions]"></ng-content>
          @if (link()) {
            <a class="dash-link" [routerLink]="link()" [attr.aria-label]="'Open ' + title()">{{ linkLabel() }} <i class="bi bi-arrow-right" aria-hidden="true"></i></a>
          }
        </div>
      </header>

      @if (loading()) {
        <div class="dash-skeleton" aria-label="Loading">
          <span class="sk sk-lg"></span><span class="sk"></span><span class="sk sk-md"></span><span class="sk"></span>
        </div>
      } @else if (error()) {
        <div class="dash-state is-error" role="alert">
          <i class="bi bi-exclamation-octagon" aria-hidden="true"></i>
          <p>{{ error() }}</p>
          <button type="button" class="dash-btn" (click)="retry.emit()"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Try again</button>
        </div>
      } @else if (empty()) {
        <div class="dash-state">
          <i class="bi" [class]="emptyIcon()" aria-hidden="true"></i>
          <p>{{ emptyText() }}</p>
        </div>
      } @else {
        <div class="dash-card-body"><ng-content></ng-content></div>
      }
    </section>
  `,
  // Styled by the dashboard page (dashboard.scss, scoped under .dash-page).
})
export class DashCard {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly icon = input<string>('bi-grid');
  readonly tone = input<'primary' | 'blue' | 'green' | 'orange' | 'purple' | 'red'>('primary');
  readonly link = input<string | null>(null);
  readonly linkLabel = input<string>('Open');
  readonly loading = input(false);
  readonly refreshing = input(false);
  readonly error = input<string | null>(null);
  readonly empty = input(false);
  readonly emptyText = input('Nothing to show for this period yet.');
  readonly emptyIcon = input('bi-inbox');
  readonly retry = output<void>();
}
