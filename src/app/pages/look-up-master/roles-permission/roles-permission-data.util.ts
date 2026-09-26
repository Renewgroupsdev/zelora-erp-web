import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { ApiDataService } from '../../../shared/common-services/api-data.service';
import { parseRoleIds } from './add-roles-permission-form/module-form.util';
import { isSuccessResponse, RolePermissionModule } from './roles-permission.model';

/** Walks every page of the module-with-actions list endpoint and flattens it into one array.
 *  The API already nests sub_modules under each parent per page, so unlike a flat parent_id
 *  list, no client-side tree reconstruction is needed here - just walk every page and concat.
 *
 *  This checks the endpoint's actual `status: "success"` field instead of the boolean `success`
 *  flag ApiDataService.GetAllPages expects - module-with-actions doesn't follow the same response
 *  convention as the other lookup-master endpoints, so the shared helper always saw it as a
 *  failure and returned an empty list. */
export function fetchFullModuleTree(api: ApiDataService, path: string): Observable<RolePermissionModule[]> {
  return api.GET(path).pipe(
    switchMap((firstResponse: any) => {
      const firstPage = firstResponse?.data;
      const rows: any[] = firstPage?.data ?? [];

      if (!isSuccessResponse(firstResponse) || !Array.isArray(firstPage?.data)) {
        return of([]);
      }

      const lastPage = Number(firstPage?.last_page ?? 1);
      if (lastPage <= 1) {
        return of(rows);
      }

      const remainingPages = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
      return forkJoin(
        remainingPages.map((pageNumber) => api.GET(`${path}?page=${pageNumber}`))
      ).pipe(
        map((responses: any[]) => [
          ...rows,
          ...responses.flatMap((response: any) => response?.data?.data ?? []),
        ])
      );
    })
  );
}

/** Rebuilds the plain nested payload shape the module-with-actions API expects from a plain
 *  RolePermissionModule node (no reactive form involved) - the matrix screen mutates role_ids
 *  strings directly on the fetched tree, so it needs this instead of module-form.util's
 *  FormGroup-based extractModulePayload. */
export function buildModulePayloadFromNode(node: RolePermissionModule): any {
  return {
    id: node.id,
    module_name: node.module_name,
    slug_name: node.slug_name,
    url: node.url ?? null,
    role_ids: node.role_ids ?? '',
    actions: (node.actions ?? []).map((action) => ({
      id: action.id,
      permission_id: action.permission_id ?? null,
      action_name: action.action_name,
      slug_name: action.slug_name,
      url: action.url ?? null,
      logo: action.logo ?? null,
      permission: action.permission,
      role_ids: action.role_ids ?? '',
    })),
    sub_modules: (node.sub_modules ?? []).map(buildModulePayloadFromNode),
  };
}

/** A module node enriched with the one bit of UI-only state (expand/collapse) the permission
 *  matrix screen needs - unlike DisplayModuleNode (built for the read-only tree view), the
 *  matrix mutates role_ids directly on these nodes as the admin toggles checkboxes. */
export interface MatrixModuleNode extends Omit<RolePermissionModule, 'sub_modules'> {
  sub_modules: MatrixModuleNode[];
  expanded: boolean;
}

export function toMatrixNode(module: RolePermissionModule): MatrixModuleNode {
  return {
    ...module,
    actions: module.actions ?? [],
    sub_modules: (module.sub_modules ?? []).map(toMatrixNode),
    expanded: false,
  };
}

export function hasRole(roleIds: string | null | undefined, roleId: number | null): boolean {
  return roleId != null && parseRoleIds(roleIds).includes(roleId);
}

export function setRole(roleIds: string | null | undefined, roleId: number, checked: boolean): string {
  const current = parseRoleIds(roleIds);
  const next = checked
    ? (current.includes(roleId) ? current : [...current, roleId])
    : current.filter((id) => id !== roleId);
  return next.join(',');
}

/** Checking a module grants the selected role access to it and everything under it in one
 *  click (all its actions and every nested sub-module's actions); unchecking revokes the same
 *  way - this is what turns "tick 20+ modules one at a time" into "tick the top node once". */
export function cascadeSetRole(node: MatrixModuleNode, roleId: number, checked: boolean): void {
  node.role_ids = setRole(node.role_ids, roleId, checked);
  node.actions.forEach((action) => {
    action.role_ids = setRole(action.role_ids, roleId, checked);
  });
  node.sub_modules.forEach((child) => cascadeSetRole(child, roleId, checked));
}

/** Flattens a node's own checked state plus every descendant action/sub-module's checked state
 *  for one role, so the caller can tell "all checked" / "none checked" / "mixed" apart - the
 *  mixed case is what renders a module's checkbox as indeterminate. */
export function collectRoleStates(node: MatrixModuleNode, roleId: number, states: boolean[]): void {
  states.push(hasRole(node.role_ids, roleId));
  node.actions.forEach((action) => states.push(hasRole(action.role_ids, roleId)));
  node.sub_modules.forEach((child) => collectRoleStates(child, roleId, states));
}

export function nodeMatchesSearch(node: MatrixModuleNode, lowerTerm: string): boolean {
  if (!lowerTerm) return true;
  if (node.module_name.toLowerCase().includes(lowerTerm) || node.slug_name.toLowerCase().includes(lowerTerm)) {
    return true;
  }
  return node.sub_modules.some((child) => nodeMatchesSearch(child, lowerTerm));
}
