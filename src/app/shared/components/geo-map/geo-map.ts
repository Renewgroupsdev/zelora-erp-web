import { CommonModule } from '@angular/common';
import {
  Component, ElementRef, NgZone, OnDestroy, ViewEncapsulation, afterNextRender, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import type * as Leaflet from 'leaflet';
import { GeoPoint, isValidGeo, roundGeo } from '../../utils/geo.util';

export type GeoMapLayer = 'satellite' | 'street';

const LAYER_KEY = 'geo-map-layer';

/** Where the map opens when no point is set yet (India) - the user then clicks to drop the first pin. */
const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;
const POINT_ZOOM = 17;

/*
 * Tile sources. Satellite = Esri World Imagery with a place-name overlay (no API key needed); street = OpenStreetMap.
 * To switch provider (Mapbox / MapTiler / Google Maps Platform with a key) change the URLs here only.
 */
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const STREET_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Interactive map for the Branch / Franchise geo location, built on Leaflet (loaded on first use).
 *
 *  - read-only (details page): shows the pin with satellite / street switch, zoom and "back to pin".
 *  - editable (add / edit form): click anywhere on the map or drag the pin to set the location,
 *    and the map flies to the point when the coordinates are typed, found from an address or taken from GPS.
 *
 * Usage: <app-geo-map [latitude]="lat" [longitude]="lng" [editable]="true" (pointChange)="set($event)" />
 */
@Component({
  selector: 'app-geo-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './geo-map.html',
  styleUrl: './geo-map.scss',
  encapsulation: ViewEncapsulation.None, // Leaflet builds its own DOM (pin, controls), so the styles must be global
  host: { class: 'geo-map-host', '[style.height]': 'height()' },
})
export class GeoMap implements OnDestroy {
  readonly latitude = input<number | null | undefined>(null);
  readonly longitude = input<number | null | undefined>(null);
  /** Click the map / drag the pin to choose the location. */
  readonly editable = input(false);
  /** Any CSS height, e.g. "240px". Leave unset to size the map from the parent's CSS (flex / fixed height). */
  readonly height = input<string | null>(null);
  /** Emitted (rounded to 6 decimals) when the user places or drags the pin. */
  readonly pointChange = output<GeoPoint>();

  readonly layer = signal<GeoMapLayer>(this.savedLayer());
  readonly ready = signal(false);
  readonly failed = signal(false);

  private readonly zone = inject(NgZone);
  private readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('mapEl');

  private L: typeof Leaflet | null = null;
  private map: Leaflet.Map | null = null;
  private marker: Leaflet.Marker | null = null;
  private tiles: Leaflet.Layer[] = [];
  private observer: ResizeObserver | null = null;
  /** Set when the user placed the pin, so the map keeps their zoom instead of jumping in. */
  private placedByUser = false;

  constructor() {
    afterNextRender(() => void this.init());

    // keep the pin / view in step with the inputs (typed coordinates, GPS, address lookup, form reset)
    effect(() => {
      const lat = this.latitude();
      const lng = this.longitude();
      if (!this.ready()) return;
      this.syncPoint(isValidGeo(lat, lng) ? { latitude: Number(lat), longitude: Number(lng) } : null);
    });

    effect(() => {
      this.layer();
      if (this.ready()) this.applyLayer();
    });

    effect(() => {
      this.editable();
      if (this.ready()) this.applyEditable();
    });
  }

  setLayer(layer: GeoMapLayer): void {
    this.layer.set(layer);
    try {
      localStorage.setItem(LAYER_KEY, layer);
    } catch {
      // storage blocked - the choice just isn't remembered
    }
  }

  zoomBy(delta: number): void {
    this.map?.setZoom((this.map.getZoom() ?? DEFAULT_ZOOM) + delta);
  }

  /** "Back to pin" - recentres on the saved point. */
  recenter(): void {
    if (this.marker) this.map?.flyTo(this.marker.getLatLng(), Math.max(this.map.getZoom(), POINT_ZOOM), { duration: 0.6 });
  }

  hasPoint(): boolean {
    return isValidGeo(this.latitude(), this.longitude());
  }

  private async init(): Promise<void> {
    try {
      const mod: any = await import('leaflet');
      this.L = mod.default ?? mod;
    } catch {
      this.failed.set(true);
      return;
    }
    const L = this.L!;

    this.zone.runOutsideAngular(() => {
      this.map = L.map(this.mapEl().nativeElement, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: this.editable(),
        worldCopyJump: true,
      });
      this.map.attributionControl.setPrefix(false);
      // place names sit above the imagery but below the pin, and never swallow clicks
      const labels = this.map.createPane('labels');
      labels.style.zIndex = '250';
      labels.style.pointerEvents = 'none';

      // dialogs animate open and cards resize - keep the tiles filling the box
      this.observer = new ResizeObserver(() => this.map?.invalidateSize());
      this.observer.observe(this.mapEl().nativeElement);
    });

    this.ready.set(true); // runs the sync effects above
  }

  private applyLayer(): void {
    const L = this.L;
    if (!L || !this.map) return;
    this.tiles.forEach(t => t.remove());

    this.zone.runOutsideAngular(() => {
      if (this.layer() === 'satellite') {
        const imagery = L.tileLayer(SATELLITE_URL, {
          maxZoom: 19,
          attribution: 'Tiles &copy; Esri &mdash; Maxar, Earthstar Geographics, GIS User Community',
        });
        const labels = L.tileLayer(LABELS_URL, { maxZoom: 19, pane: 'labels' });
        this.tiles = [imagery, labels];
      } else {
        this.tiles = [L.tileLayer(STREET_URL, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' })];
      }
      this.tiles.forEach(t => t.addTo(this.map!));
    });
  }

  private applyEditable(): void {
    const map = this.map;
    if (!map) return;
    map.off('click');
    if (this.editable()) {
      map.scrollWheelZoom.enable();
      map.on('click', (e: Leaflet.LeafletMouseEvent) => this.place(e.latlng));
    } else {
      map.scrollWheelZoom.disable();
    }
    this.marker?.dragging?.[this.editable() ? 'enable' : 'disable']();
    this.mapEl().nativeElement.classList.toggle('is-editable', this.editable());
  }

  private syncPoint(point: GeoPoint | null): void {
    const L = this.L;
    const map = this.map;
    if (!L || !map) return;

    if (!point) {
      this.marker?.remove();
      this.marker = null;
      return;
    }

    const latlng = L.latLng(point.latitude, point.longitude);
    this.zone.runOutsideAngular(() => {
      if (!this.marker) {
        this.marker = L.marker(latlng, { icon: this.pinIcon(), draggable: this.editable(), autoPan: true, keyboard: false })
          .addTo(map);
        this.marker.on('dragend', () => this.place(this.marker!.getLatLng(), false));
        if (this.placedByUser) this.placedByUser = false;
        else map.setView(latlng, POINT_ZOOM);
        return;
      }

      // already on the map: only move when the new point is not where the pin already is (the user just placed it)
      if (this.marker.getLatLng().distanceTo(latlng) > 0.5) {
        this.marker.setLatLng(latlng);
        map.flyTo(latlng, Math.max(map.getZoom(), POINT_ZOOM), { duration: 0.6 });
      }
    });
  }

  /** The user clicked the map or dropped the pin. */
  private place(latlng: Leaflet.LatLng, move = true): void {
    const point: GeoPoint = { latitude: roundGeo(latlng.lat), longitude: roundGeo(latlng.lng) };
    this.placedByUser = true;
    if (move && this.marker) this.marker.setLatLng(latlng);
    this.zone.run(() => this.pointChange.emit(point));
  }

  private pinIcon(): Leaflet.DivIcon {
    return this.L!.divIcon({
      className: 'gm-pin-wrap',
      html: '<span class="gm-pin"><i></i></span><span class="gm-pin-shadow"></span>',
      iconSize: [34, 44],
      iconAnchor: [17, 42],
    });
  }

  private savedLayer(): GeoMapLayer {
    try {
      return localStorage.getItem(LAYER_KEY) === 'street' ? 'street' : 'satellite';
    } catch {
      return 'satellite';
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.map?.remove();
    this.map = null;
    this.marker = null;
  }
}
