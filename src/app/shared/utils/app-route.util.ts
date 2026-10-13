import { Route, Routes } from '@angular/router';

interface RoutePattern {
  parts: string[];
  /** A lazy child module (loadChildren): its own routes are not known here, so anything under it matches. */
  prefixOnly: boolean;
}

/** Path patterns of every page in the router config, e.g. app/inventory/purchase-requests, app/branches/:id. */
function routePatterns(routes: Routes, prefix: string[] = []): RoutePattern[] {
  return routes.flatMap((route: Route) => {
    if (route.path === undefined || route.path === '**') return [];
    const parts = [...prefix, ...route.path.split('/').filter(Boolean)];
    const own: RoutePattern[] = route.component || route.loadComponent || route.redirectTo !== undefined || route.loadChildren
      ? [{ parts, prefixOnly: !!route.loadChildren }]
      : [];
    return [...own, ...routePatterns(route.children ?? [], parts)];
  });
}

/**
 * True when an in-app URL (as typed in Roles & Permissions, e.g. '/app/inventory/purchase-requests')
 * opens a real page of this app - `:param` segments match anything. External links (http...) and empty
 * URLs return true: they are not ours to check.
 */
export function isAppRoute(routes: Routes, url: string | null | undefined): boolean {
  const value = (url ?? '').trim();
  if (!value || /^https?:\/\//i.test(value)) return true;

  const segments = value.split(/[?#]/)[0].split('/').filter(Boolean);
  return routePatterns(routes).some(({ parts, prefixOnly }) => {
    if (prefixOnly ? segments.length < parts.length : segments.length !== parts.length) return false;
    return parts.every((part, i) => part.startsWith(':') || part === segments[i]);
  });
}
