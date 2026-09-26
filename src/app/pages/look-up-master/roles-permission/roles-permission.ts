import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonFilterState, FilterOption } from '../../../shared/models/common-components.model';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { ModuleReorderEvent, ModuleTreeNode } from './module-tree-node/module-tree-node';
import { fetchFullModuleTree } from './roles-permission-data.util';
import { DisplayModuleNode, isSuccessResponse, RolePermissionModule } from './roles-permission.model';

@Component({
  selector: 'app-roles-permission',
  standalone: true,
  imports: [CommonModule, DragDropModule, CommonFilterCard, ModuleTreeNode],
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
  /** Public so the template can disable drag-reordering while a search filter narrows the
   *  visible list - filteredModules would no longer reflect real sibling positions then. */
  searchTerm = '';

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

    fetchFullModuleTree(this.apiDataService, ApiRoutesConstants.ROLES_PERMISSION_GET_List).subscribe({
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

  onAssignPermissions(): void {
    this.router.navigate(['/app/masters/roles-and-permission/assign']);
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

  /** Root modules reorder directly against filteredModules - when no search is active it's the
   *  exact same array reference as `modules` (filterTree() returns it unchanged), so mutating
   *  it here also reorders the underlying data with no separate sync step needed. */
  onRootDrop(event: CdkDragDrop<DisplayModuleNode[]>): void {
    if (event.previousIndex === event.currentIndex) return;

    moveItemInArray(this.filteredModules, event.previousIndex, event.currentIndex);
    const items = this.filteredModules.map((node, index) => ({ id: node.id!, position: index }));
    this.persistReorder(items, 'Module order updated.', 'Failed to update module order.');
  }

  /** Bubbled up from module-tree-node once it has already reordered a parent's sub_modules
   *  locally - this just persists the resulting positions. */
  onChildrenReordered(event: ModuleReorderEvent): void {
    this.persistReorder(event.items, 'Sub-module order updated.', 'Failed to update sub-module order.');
  }

  private persistReorder(items: { id: number; position: number }[], successMessage: string, failMessage: string): void {
    this.apiDataService.PUT(ApiRoutesConstants.ROLES_PERMISSION_REORDER, { items }).subscribe({
      next: (response: any) => {
        if (isSuccessResponse(response)) {
          this.toast.success(successMessage);
        } else {
          this.toast.error(response?.message || failMessage);
          this.loadModules();
        }
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || failMessage);
        console.error(failMessage, err);
        this.loadModules();
      },
    });
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
