export interface RolePermissionAction {
  id?: number;
  /** FK back to the owning module/sub-module row - not user-editable, but must round-trip
   *  unchanged on save or the backend loses track of which module this action belongs to. */
  permission_id?: number | null;
  action_name: string;
  slug_name: string;
  url?: string | null;
  /** Icon class name (e.g. a Bootstrap Icon class like "bi-eye-fill") rendered next to this
   *  action wherever it shows up as a clickable action. */
  logo?: string | null;
  permission: number;
  /** Comma-separated role ids this action is scoped to. Empty/missing means the action inherits
   *  its parent module's role_ids rather than being hidden from everyone. */
  role_ids?: string | null;
}

export interface RolePermissionModule {
  id?: number;
  parent_id?: number | null;
  /** Sort order among sibling modules (same parent_id) - lower shows first. Maintained by
   *  dragging modules to reorder them on the Assign Permissions screen. */
  position?: number;
  role_ids: string;
  module_name: string;
  slug_name: string;
  url?: string | null;
  actions: RolePermissionAction[];
  sub_modules: RolePermissionModule[];
  created_at?: string;
  updated_at?: string;
}

export type { RoleOption } from '../../../shared/models/role-option.model';

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
