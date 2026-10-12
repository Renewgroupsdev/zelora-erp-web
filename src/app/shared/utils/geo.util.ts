/** A point on the map, in decimal degrees (WGS84 - what GPS, Google Maps and OpenStreetMap use). */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** True when both coordinates are set and inside the valid latitude / longitude range. */
export function isValidGeo(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const lo = Number(lng);
  return lat !== null && lat !== undefined && lat !== '' && lng !== null && lng !== undefined && lng !== ''
    && Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

/** Rounds to 6 decimals (about 10 cm) - more is noise from the GPS / geocoder. */
export function roundGeo(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function formatGeo(p: GeoPoint): string {
  return `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`;
}

/** OpenStreetMap embed (no API key needed) centred on the point, with a marker. */
export function mapEmbedUrl(p: GeoPoint, span = 0.006): string {
  const bbox = [p.longitude - span, p.latitude - span / 2, p.longitude + span, p.latitude + span / 2].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${p.latitude},${p.longitude}`;
}

export function googleMapsUrl(p: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
}

export function directionsUrl(p: GeoPoint): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
}

/** The device's current position (browser GPS / Wi-Fi location). Rejects with a readable message. */
export function currentPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject('This browser cannot share its location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: roundGeo(pos.coords.latitude), longitude: roundGeo(pos.coords.longitude) }),
      err => reject(err.code === err.PERMISSION_DENIED
        ? 'Location permission was denied. Allow location access for this site and try again.'
        : 'Could not get your current location. Try again or enter the coordinates.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

/** Looks an address up on OpenStreetMap (Nominatim). Resolves null when nothing matches. */
export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  const q = query.trim();
  if (!q) return null;
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Address lookup failed.');
  const rows: { lat: string; lon: string }[] = await res.json();
  return rows.length ? { latitude: roundGeo(Number(rows[0].lat)), longitude: roundGeo(Number(rows[0].lon)) } : null;
}
