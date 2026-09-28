export interface SidebarAction {
  id?: number;
  action_name: string;
  slug_name: string;
  url?: string | null;
  logo?: string | null;
  permission: number;
}

export interface SidebarModule {
  id?: number;
  parent_id?: number | null;
  module_name: string;
  slug_name: string;
  url?: string | null;
  actions: SidebarAction[];
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
