import { Component, input, output, ViewEncapsulation } from '@angular/core';
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
  templateUrl: './dash-card.html',
  styleUrl: './dash-card.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
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
