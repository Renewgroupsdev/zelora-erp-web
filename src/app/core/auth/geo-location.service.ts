import { Injectable } from '@angular/core';

export interface DeviceLocation {
  latitude: number;
  longitude: number;
}

/**
 * The device location sent with a login (`latitude` / `longitude`). Never blocks or fails a login: when the browser has
 * no geolocation, the user denies it, or it takes longer than the timeout, the login simply goes without a location.
 */
@Injectable({ providedIn: 'root' })
export class GeoLocationService {
  /** Longest a sign-in waits for the browser (a permission prompt counts), in ms. */
  private static readonly TIMEOUT_MS = 8000;

  current(): Promise<DeviceLocation | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);

    return new Promise(resolve => {
      // The browser's own timeout does not start until permission is given, so guard the whole wait as well.
      const guard = setTimeout(() => resolve(null), GeoLocationService.TIMEOUT_MS + 500);
      navigator.geolocation.getCurrentPosition(
        pos => { clearTimeout(guard); resolve({ latitude: round(pos.coords.latitude), longitude: round(pos.coords.longitude) }); },
        () => { clearTimeout(guard); resolve(null); },
        { enableHighAccuracy: false, timeout: GeoLocationService.TIMEOUT_MS, maximumAge: 60_000 },
      );
    });
  }
}

/** 7 decimals (~1 cm) is what the API stores. */
function round(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}
