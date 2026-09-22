import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CookieService {

  set(name: string, value: string, days: number): void {
    const maxAge = Math.round(days * 24 * 60 * 60);
    // `Secure` cookies are dropped by the browser on plain http (e.g. http://localhost),
    // so only add it when the app is actually served over https.
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax${secure}`;
  }

  get(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  remove(name: string): void {
    document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`;
  }
}
