import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonFilterState, FilterOption } from '../../../shared/models/common-components.model';
import { ApiDataService } from '../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { ModuleTreeNode } from './module-tree-node/module-tree-node';
import { DisplayModuleNode, isSuccessResponse, RolePermissionModule } from './roles-permission.model';

@Component({
  selector: 'app-roles-permission',
  standalone: true,
  imports: [CommonModule, CommonFilterCard, ModuleTreeNode],
  templateUrl: './roles-permission.html',
  styleUrl: './roles-permission.scss',
})
export class RolesPermission implements OnInit {

  constructor(
    private router: Router,
    private apiDataService: ApiDataService,
    private toast: ToastService,
  ) { }

  filters: FilterOption[] = [];

  filterState: CommonFilterState = {
    status: null,
    source: null,
    branch: [],
    telecaller: null,
    dateFrom: null,
    dateTo: null,
  };

  isLoading = false;
  totalModules = 0;
  totalActions = 0;
  totalRolesMapped = 0;

  modules: DisplayModuleNode[] = [];
  filteredModules: DisplayModuleNode[] = [];

  /** role id -> role name, used to render human-readable role chips from each node's
   *  comma-separated role_ids string. */
  private rolesById = new Map<number, string>();
  private searchTerm = '';

  ngOnInit(): void {
    this.loadRoles(() => this.loadModules());
  }

  private loadRoles(onDone: () => void): void {
    this.apiDataService.GetAllPages(ApiRoutesConstants.ROLES_GET_List).subscribe({
      next: (roles: any[]) => {
        this.rolesById.clear();
        roles.forEach((role: any) => this.rolesById.set(role.id, role.name ?? `Role #${role.id}`));
        onDone();
      },
      error: (err: any) => {
        console.error('Failed to load roles:', err);
        onDone();
      },
    });
  }

  loadModules(): void {
    this.isLoading = true;

    // The API already nests sub_modules under each parent per page, so unlike a flat parent_id
    // list, no client-side tree reconstruction is needed here - just walk every page and map.
    this.fetchAllModulePages(ApiRoutesConstants.ROLES_PERMISSION_GET_List).subscribe({
      next: (modules: RolePermissionModule[]) => {
        this.isLoading = false;
        this.modules = modules.map((module) => this.toDisplayNode(module));
        this.computeSummary(this.modules);
        this.applyFilters();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('Failed to load modules. Please try again.');
        console.error('Failed to load modules:', err);
      },
    });
  }

  /** Same page-walking behavior as ApiDataService.GetAllPages, but checking this endpoint's
   *  actual `status: "success"` field instead of the boolean `success` flag GetAllPages expects -
   *  module-with-actions doesn't follow the same response convention as the other lookup-master
   *  endpoints, so the shared helper always saw it as a failure and returned an empty list. */
  private fetchAllModulePages(path: string): Observable<any[]> {
    return this.apiDataService.GET(path).pipe(
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
          remainingPages.map((pageNumber) => this.apiDataService.GET(`${path}?page=${pageNumber}`))
        ).pipe(
          map((responses: any[]) => [
            ...rows,
            ...responses.flatMap((response: any) => response?.data?.data ?? []),
          ])
        );
      })
    );
  }

  private toDisplayNode(module: RolePermissionModule): DisplayModuleNode {
    const subModules = (module.sub_modules ?? []).map((child) => this.toDisplayNode(child));

    return {
      ...module,
      actions: module.actions ?? [],
      sub_modules: subModules,
      expanded: false,
      roleNames: this.resolveRoleNames(module.role_ids),
      descendantCount: subModules.reduce((sum, child) => sum + 1 + child.descendantCount, 0),
    };
  }

  private resolveRoleNames(roleIds: string | null | undefined): string {
    if (!roleIds) return 'No roles assigned';

    const names = roleIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => this.rolesById.get(Number(id)) ?? `#${id}`);

    return names.length ? names.join(', ') : 'No roles assigned';
  }

  private computeSummary(nodes: DisplayModuleNode[]): void {
    const uniqueRoleIds = new Set<string>();
    let moduleCount = 0;
    let actionCount = 0;

    const walk = (list: DisplayModuleNode[]) => {
      list.forEach((node) => {
        moduleCount += 1;
        actionCount += node.actions.length;
        (node.role_ids ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
          .forEach((id) => uniqueRoleIds.add(id));
        walk(node.sub_modules);
      });
    };

    walk(nodes);

    this.totalModules = moduleCount;
    this.totalActions = actionCount;
    this.totalRolesMapped = uniqueRoleIds.size;
  }

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
    this.applyFilters();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.applyFilters();
  }

  get recordCountText(): string {
    return `${this.totalModules.toLocaleString()} modules`;
  }

  /** A module matching the search term keeps all of its sub-modules; otherwise only the
   *  matching descendants survive - and if any did, the module is force-expanded to reveal them. */
  private applyFilters(): void {
    this.filteredModules = this.filterTree(this.modules, this.searchTerm);
  }

  private filterTree(nodes: DisplayModuleNode[], term: string): DisplayModuleNode[] {
    if (!term) return nodes;

    const result: DisplayModuleNode[] = [];

    nodes.forEach((node) => {
      const selfMatches =
        node.module_name.toLowerCase().includes(term) || node.slug_name.toLowerCase().includes(term);
      const filteredChildren = this.filterTree(node.sub_modules, term);

      if (selfMatches || filteredChildren.length) {
        result.push({
          ...node,
          sub_modules: selfMatches ? node.sub_modules : filteredChildren,
          expanded: true,
        });
      }
    });

    return result;
  }

  onAddModule(): void {
    this.router.navigate(['/app/masters/roles-and-permission/add']);
  }

  onAddChildModule(node: DisplayModuleNode): void {
    this.router.navigate(['/app/masters/roles-and-permission/add'], {
      queryParams: { parentId: node.id, parentName: node.module_name },
    });
  }

  onEditModule(node: DisplayModuleNode): void {
    this.router.navigate(['/app/masters/roles-and-permission/edit', node.id]);
  }

  onOpenModuleUrl(node: DisplayModuleNode): void {
    const url = node.url?.trim();
    if (!url) return;

    if (/^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener');
    } else {
      this.router.navigateByUrl(url);
    }
  }

  async onDeleteModule(node: DisplayModuleNode): Promise<void> {
    const confirmed = await this.toast.confirm(
      'Delete this module?',
      node.descendantCount
        ? `${node.module_name} and its ${node.descendantCount} sub-module(s) will be permanently removed.`
        : `${node.module_name} will be permanently removed.`
    );

    if (!confirmed) {
      return;
    }

    const path = `${ApiRoutesConstants.ROLES_PERMISSION_DELETE}/${node.id}`;
    this.apiDataService.Delete(path, {}).subscribe({
      next: (response: any) => {
        if (isSuccessResponse(response)) {
          this.toast.success('Module deleted successfully');
          this.loadModules();
        } else {
          this.toast.error(response?.message || 'Failed to delete module. Please try again.');
        }
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Failed to delete module. Please try again.');
        console.error('Failed to delete module:', err);
      },
    });
  }
}
