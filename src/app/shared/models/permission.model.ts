/** Mirrors the backend's `modules_premission` / `module_action_premission` rows as returned
 *  by the `/side-bar` endpoint, already filtered down to the current user's role. */
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

/** Flattens a role's permitted module tree into the set of module slugs it grants access to
 *  (parents and sub-modules alike) - used to check "can this role see module X" by slug. */
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
