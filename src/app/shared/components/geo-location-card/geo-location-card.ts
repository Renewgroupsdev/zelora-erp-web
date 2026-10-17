import { CommonModule } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { GeoMap } from '../geo-map/geo-map';
import { GeoPoint, directionsUrl, formatGeo, googleMapsUrl, isValidGeo } from '../../utils/geo.util';

/**
 * Geo Location block on the Branch / Franchise details page: a satellite / street map with the pin,
 * the coordinates (copyable) and links to open the place or get directions in Google Maps.
 */
@Component({
  selector: 'app-geo-location-card',
  standalone: true,
  imports: [CommonModule, GeoMap],
  templateUrl: './geo-location-card.html',
  styleUrl: './geo-location-card.scss',
  host: { '[class.compact]': 'compact()' },
})
export class GeoLocationCard {
  readonly latitude = input<number | null | undefined>(null);
  readonly longitude = input<number | null | undefined>(null);
  /** Address line shown under the coordinates (e.g. street, city, state). */
  readonly address = input('');
  /** Narrow column layout: smaller map, coordinates two per row, address and actions full width. */
  readonly compact = input(false);
  /** Fixed map height (any CSS length). Leave unset to let the layout size it (full-page card / flex column). */
  readonly mapHeight = input<string | null>(null);
  /** Hide the address tile when the page already shows the address next to the card (e.g. the side drawer). */
  readonly showAddress = input(true);
  /** Fired by "Add location" when no coordinates are saved yet (the page opens its edit form). */
  readonly addLocation = output<void>();

  readonly copied = signal(false);

  readonly point = computed<GeoPoint | null>(() =>
    isValidGeo(this.latitude(), this.longitude()) ? { latitude: Number(this.latitude()), longitude: Number(this.longitude()) } : null);

  readonly mapsUrl = computed(() => (this.point() ? googleMapsUrl(this.point()!) : ''));
  readonly routeUrl = computed(() => (this.point() ? directionsUrl(this.point()!) : ''));
  readonly coords = computed(() => (this.point() ? formatGeo(this.point()!) : ''));

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.coords());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      this.copied.set(false);
    }
  }
}
