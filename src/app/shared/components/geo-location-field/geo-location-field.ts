import { CommonModule } from '@angular/common';
import { Component, computed, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GeoMap } from '../geo-map/geo-map';
import { GeoPoint, currentPosition, geocodeAddress, isValidGeo } from '../../utils/geo.util';

/**
 * Latitude / longitude inputs for the Branch and Franchise forms, with "Use current location"
 * (device GPS) and "Find from address" (OpenStreetMap lookup) plus an interactive satellite / street map:
 * click the map or drag the pin to mark the location.
 * Usage: <app-geo-location-field [(latitude)]="model.latitude" [(longitude)]="model.longitude" [address]="..." />
 */
@Component({
  selector: 'app-geo-location-field',
  standalone: true,
  imports: [CommonModule, FormsModule, GeoMap],
  templateUrl: './geo-location-field.html',
  styleUrls: ['../../styles/erp-dialog.scss', './geo-location-field.scss'],
})
export class GeoLocationField {
  readonly latitude = model<number | null | undefined>(null);
  readonly longitude = model<number | null | undefined>(null);
  /** Address text used by "Find from address" (street, city, state). */
  readonly address = input('');
  /** Prefix for the input ids, so two fields on one page don't clash. */
  readonly idPrefix = input('geo');

  readonly busy = signal<'gps' | 'address' | null>(null);
  readonly error = signal<string | null>(null);

  readonly hasPoint = computed(() => isValidGeo(this.latitude(), this.longitude()));

  readonly latInvalid = computed(() => this.outOfRange(this.latitude(), 90));
  readonly lngInvalid = computed(() => this.outOfRange(this.longitude(), 180));

  /** The pin was placed / dragged on the map. */
  setPoint(point: GeoPoint): void {
    this.error.set(null);
    this.latitude.set(point.latitude);
    this.longitude.set(point.longitude);
  }

  setLatitude(value: unknown): void {
    this.latitude.set(this.toNumber(value));
  }

  setLongitude(value: unknown): void {
    this.longitude.set(this.toNumber(value));
  }

  async useCurrentLocation(): Promise<void> {
    this.error.set(null);
    this.busy.set('gps');
    try {
      const p = await currentPosition();
      this.latitude.set(p.latitude);
      this.longitude.set(p.longitude);
    } catch (message) {
      this.error.set(String(message));
    } finally {
      this.busy.set(null);
    }
  }

  async findFromAddress(): Promise<void> {
    this.error.set(null);
    if (!this.address().trim()) {
      this.error.set('Fill in the address / city first.');
      return;
    }
    this.busy.set('address');
    try {
      const p = await geocodeAddress(this.address());
      if (!p) {
        this.error.set('No location found for this address. Use current location or enter the coordinates.');
        return;
      }
      this.latitude.set(p.latitude);
      this.longitude.set(p.longitude);
    } catch {
      this.error.set('Address lookup is unavailable right now. Enter the coordinates instead.');
    } finally {
      this.busy.set(null);
    }
  }

  clear(): void {
    this.latitude.set(null);
    this.longitude.set(null);
    this.error.set(null);
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private outOfRange(value: number | null | undefined, max: number): boolean {
    return value !== null && value !== undefined && (Math.abs(Number(value)) > max);
  }
}
