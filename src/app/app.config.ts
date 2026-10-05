import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { NavigationError, provideRouter, withNavigationErrorHandler } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/auth/auth.interceptor';

const CHUNK_RELOAD_KEY = 'chunk_reload_at';
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i;

/**
 * After a rebuild/deploy the lazy chunk file names change, so a tab still running the old
 * bundle 404s on `import()`. Do one full page load of the target URL to pick up the new
 * bundle; the timestamp guard stops a reload loop if the chunk is genuinely unreachable.
 */
function reloadOnStaleChunk(error: NavigationError): void {
  if (!CHUNK_ERROR.test(String(error.error?.message ?? error.error))) return;

  let last = 0;
  try { last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < 10_000) return;

  try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now())); } catch { /* storage blocked */ }
  window.location.assign(error.url);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withNavigationErrorHandler(reloadOnStaleChunk))
  ]
};
