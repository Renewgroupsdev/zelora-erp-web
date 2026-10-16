import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, CanMatchFn, Router, UrlSegment } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarModule, SidebarTab, findModule, normalizeModulePath } from '../models/permission.model';

/**
 * Module tabs come from the permissions API: each module's `tabs` array (Roles & Permissions -> Edit Module ->
 * Tabs), already filtered to the signed-in role. Nothing here lists tabs by hand - a tab is added, renamed,
 * reordered, re-pointed or taken from a role on the Roles & Permissions screens only.
 */

const DEFAULT_TAB_ICON = 'bi-circle';

/** A tab that opens a page of its own (HR, Purchase Management). */
export interface RouteTab {
  label: string;
  icon: string;
  path: string;
  permission: string;
}

/** A tab that switches a section inside one page (Branch / Franchise details), keyed by `?tab=<key>`. */
export interface PageTab<K extends string = string> {
  /** A section the page renders (K), or a new one added on Roles & Permissions that isn't built yet. */
  key: K | (string & {});
  /** True for a section the page can't render yet - it shows the Work in progress card. */
  wip: boolean;
  label: string;
  icon: string;
  permission: string;
}

/** Allowed tabs (permission on), in their saved order. */
function sortedEnabled(tabs: SidebarTab[] | undefined): SidebarTab[] {
  return [...(tabs ?? [])]
    .filter(tab => Number(tab.permission) === 1)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** The module's allowed tabs (permission on), in their saved order. */
function enabledTabs(auth: AuthService, moduleSlug: string): SidebarTab[] {
  return sortedEnabled(findModule(auth.permissions(), moduleSlug)?.tabs);
}

function tabLabel(tab: SidebarTab): string {
  return tab.tab_name?.trim() || tab.slug_name;
}

function tabIcon(tab: SidebarTab): string {
  return tab.icon?.trim() || DEFAULT_TAB_ICON;
}

/** The tab's in-app path ('/app/...', no query), or null when it is empty or external. */
function tabPath(tab: SidebarTab): string | null {
  const path = normalizeModulePath(tab.url?.trim())?.split(/[?#]/)[0] ?? null;
  return path && path.startsWith('/app/') ? path : null;
}

/**
 * A module's page tabs - each opens a page of its own. Skipped: empty / external URLs, and in-page section tabs
 * (a `?tab=` URL or a `:param` path, e.g. '/app/branches/:id?tab=sales'), which their details page shows itself.
 * A tab whose URL has no page built yet still shows - it opens the Work in progress page instead of the 404 page.
 */
function routeTabsOf(module: SidebarModule | undefined): RouteTab[] {
  return sortedEnabled(module?.tabs).flatMap(tab => {
    const path = tabPath(tab);
    if (!path || path.includes('/:') || /[?&]tab=/.test(tab.url ?? '')) return [];
    return [{ permission: tab.slug_name, path, icon: tabIcon(tab), label: tabLabel(tab) }];
  });
}

/** Page tabs of the module with this slug (see routeTabsOf). */
export function allowedRouteTabs(auth: AuthService, _router: Router, moduleSlug: string): RouteTab[] {
  return routeTabsOf(findModule(auth.permissions(), moduleSlug));
}

/**
 * Modules whose pages draw their own tab strip (with live badges) - the layout's automatic strip leaves them alone.
 * Every other module gets its tabs shown by the layout (AutoModuleTabs) as soon as they're added.
 */
export const OWN_TAB_STRIP_MODULES: readonly string[] = ['purchase-management', 'hr-management'];

/** The module a page belongs to, its page tabs, and the tab (or the module itself) the page is. */
export interface ModuleTabMatch {
  module: SidebarModule;
  tabs: RouteTab[];
  current: RouteTab;
}

/**
 * Which of the role's modules this in-app path belongs to: first a page tab with this URL (any module or
 * sub-module), else a module whose own URL it is. Lets any page - Treatment Management, a brand-new module ... -
 * pick up the tabs added for it on Roles & Permissions with no code of its own.
 */
export function findModuleTabsForPath(auth: AuthService, path: string): ModuleTabMatch | null {
  const modules = auth.permissions();

  const byTab = (list: SidebarModule[] | undefined): ModuleTabMatch | null => {
    for (const module of list ?? []) {
      const tabs = routeTabsOf(module);
      const current = tabs.find(tab => tab.path === path);
      if (current) return { module, tabs, current };
      const found = byTab(module.sub_modules);
      if (found) return found;
    }
    return null;
  };

  const byModuleUrl = (list: SidebarModule[] | undefined): ModuleTabMatch | null => {
    for (const module of list ?? []) {
      if (normalizeModulePath(module.url?.trim())?.split(/[?#]/)[0] === path) {
        return {
          module,
          tabs: routeTabsOf(module),
          current: { path, label: module.module_name, icon: module.icon?.trim() || DEFAULT_TAB_ICON, permission: module.slug_name },
        };
      }
      const found = byModuleUrl(module.sub_modules);
      if (found) return found;
    }
    return null;
  };

  return byTab(modules) ?? byModuleUrl(modules);
}

/**
 * canMatch for the Work in progress page: only a URL that is one of the role's tabs or modules but has no page
 * yet lands there - any other unknown URL falls through to the 404 page. Segments are relative to the 'app' route.
 */
export const workInProgressMatch: CanMatchFn = (_route, segments: UrlSegment[]) => {
  const path = '/app/' + segments.map(s => s.path).join('/');
  return !!findModuleTabsForPath(inject(AuthService), path);
};

/**
 * In-page section tabs of a module: the section is the `tab` query value of the tab's URL
 * (e.g. '/app/branches/:id?tab=employees' -> 'employees'), or the tab's slug when the URL has none. A section the
 * page can't render yet (not in `keys`) still shows, flagged `wip`, so the page displays its Work in progress card.
 */
export function allowedPageTabs<K extends string>(auth: AuthService, moduleSlug: string, keys: readonly K[]): PageTab<K>[] {
  const seen = new Set<string>();
  return enabledTabs(auth, moduleSlug).flatMap(tab => {
    const query = (tab.url ?? '').split('?')[1]?.split('#')[0] ?? '';
    const key = new URLSearchParams(query).get('tab')?.trim() || tab.slug_name;
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ key, wip: !(keys as readonly string[]).includes(key), permission: tab.slug_name, label: tabLabel(tab), icon: tabIcon(tab) }];
  });
}

/** Narrows an in-page tab key to one of the sections the page renders. */
export function isPageTabKey<K extends string>(keys: readonly K[], key: string): key is K {
  return (keys as readonly string[]).includes(key);
}

/**
 * Route guard for a module's page tabs: a tab the role may not see sends the user to the first tab it may
 * see, or to the dashboard when there is none.
 */
export function moduleTabGuard(moduleSlug: string): CanActivateFn {
  return (route: ActivatedRouteSnapshot) => {
    const router = inject(Router);
    // pathFromRoot already holds the 'app' layout segment: ['app', 'hr', 'payroll'].
    const path = '/' + route.pathFromRoot.flatMap(r => r.url.map(s => s.path)).join('/');
    const tabs = allowedRouteTabs(inject(AuthService), router, moduleSlug);

    if (tabs.some(tab => tab.path === path)) return true;

    return router.parseUrl(tabs[0]?.path ?? '/app/dashboard');
  };
}
