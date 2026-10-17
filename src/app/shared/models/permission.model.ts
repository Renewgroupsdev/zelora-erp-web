export interface SidebarAction {
  id?: number;
  action_name: string;
  slug_name: string;
  url?: string | null;
  logo?: string | null;
  permission: number;
}

/** A page tab of a module (Roles & Permissions -> Edit Module -> Tabs), already filtered to the role. */
export interface SidebarTab {
  id?: number;
  position?: number;
  tab_name: string;
  slug_name: string;
  url?: string | null;
  icon?: string | null;
  permission: number;
}

export interface SidebarModule {
  id?: number;
  parent_id?: number | null;
  module_name: string;
  slug_name: string;
  url?: string | null;
  icon?: string | null;
  actions: SidebarAction[];
  tabs?: SidebarTab[];
  sub_modules: SidebarModule[];
}

export function flattenModuleSlugs(modules: SidebarModule[] | null | undefined): Set<string> {
  const slugs = new Set<string>();

  const walk = (nodes: SidebarModule[] | undefined) => {
    for (const node of nodes ?? []) {
      slugs.add(node.slug_name);
      walk(node.sub_modules);
    }
  };

  walk(modules ?? []);
  return slugs;
}

/** Action slugs (e.g. 'sitting-notes') the role is assigned to anywhere in the module tree. */
export function flattenActionSlugs(modules: SidebarModule[] | null | undefined): Set<string> {
  const slugs = new Set<string>();

  const walk = (nodes: SidebarModule[] | undefined) => {
    for (const node of nodes ?? []) {
      for (const action of node.actions ?? []) {
        if (Number(action.permission) === 1) slugs.add(action.slug_name);
      }
      walk(node.sub_modules);
    }
  };

  walk(modules ?? []);
  return slugs;
}

/** The role's action with this slug anywhere in the module tree (its url / logo / name as set in Roles & Permissions). */
export function findAction(modules: SidebarModule[] | null | undefined, actionSlug: string): SidebarAction | undefined {
  for (const node of modules ?? []) {
    const found = (node.actions ?? []).find(a => a.slug_name === actionSlug && Number(a.permission) === 1)
      ?? findAction(node.sub_modules, actionSlug);
    if (found) return found;
  }
  return undefined;
}

/** The module (or sub-module) with this slug anywhere in the role's module tree. */
export function findModule(modules: SidebarModule[] | null | undefined, moduleSlug: string): SidebarModule | undefined {
  for (const node of modules ?? []) {
    if (node.slug_name === moduleSlug) return node;
    const found = findModule(node.sub_modules, moduleSlug);
    if (found) return found;
  }
  return undefined;
}

export function normalizeModulePath(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? url : `/${url}`;
}

export function firstModulePath(modules: SidebarModule[] | null | undefined): string | null {
  for (const module of modules ?? []) {
    const ownPath = normalizeModulePath(module.url);
    if (ownPath) return ownPath;

    const childPath = firstModulePath(module.sub_modules);
    if (childPath) return childPath;
  }

  return null;
}
