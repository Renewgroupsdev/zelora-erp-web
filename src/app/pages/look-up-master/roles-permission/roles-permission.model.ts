export interface RolePermissionAction {
  id?: number;
  action_name: string;
  slug_name: string;
  url?: string | null;
  /** Icon class name (e.g. a Bootstrap Icon class like "bi-eye-fill") rendered next to this
   *  action wherever it shows up as a clickable action. */
  logo?: string | null;
  permission: number;
}

export interface RolePermissionModule {
  id?: number;
  parent_id?: number | null;
  role_ids: string;
  module_name: string;
  slug_name: string;
  url?: string | null;
  actions: RolePermissionAction[];
  sub_modules: RolePermissionModule[];
  created_at?: string;
  updated_at?: string;
}

export interface RoleOption {
  id: number;
  name: string;
}

/** A module node enriched with UI-only state (expand/collapse, resolved role names, descendant
 *  count) for the tree view - built once from the raw API tree in roles-permission.ts. */
export interface DisplayModuleNode extends Omit<RolePermissionModule, 'sub_modules'> {
  sub_modules: DisplayModuleNode[];
  expanded: boolean;
  roleNames: string;
  descendantCount: number;
}

/** The module-with-actions API responds with a string `status: "success"` field, not the
 *  boolean `success` flag the rest of this app's endpoints (and ApiDataService.GetAllPages)
 *  use - normalize both conventions here so a future endpoint using either shape still works. */
export function isSuccessResponse(response: any): boolean {
  return response?.success === true || response?.status === 'success';
}
