import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { RoleOption } from '../../../../shared/models/role-option.model';
import { ApiDataService } from '../../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../../shared/common-services/toast.service';
import { ActionToggleEvent, MatrixTreeNode } from './matrix-tree-node/matrix-tree-node';
import {
  buildModulePayloadFromNode,
  cascadeSetRole,
  fetchFullModuleTree,
  hasRole,
  MatrixModuleNode,
  setRole,
  toMatrixNode,
} from '../roles-permission-data.util';
import { isSuccessResponse } from '../roles-permission.model';

/** One screen to grant a single role access across the entire existing module/sub-module/action
 *  tree in one pass, instead of reopening "Add Module & Permissions" per module - checking a
 *  module cascades to everything under it, and Save only PUTs the modules that actually changed. */
@Component({
  selector: 'app-role-permission-matrix',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, CommonFilterCard, MatrixTreeNode],
  templateUrl: './role-permission-matrix.html',
  styleUrl: './role-permission-matrix.scss',
})
export class RolePermissionMatrix implements OnInit {
  roles: RoleOption[] = [];
  selectedRoleId: number | null = null;

  tree: MatrixModuleNode[] = [];
  private snapshot: MatrixModuleNode[] = [];

  searchTerm = '';
  isLoading = false;
  isSaving = false;

  constructor(
    private router: Router,
    private apiDataService: ApiDataService,
    private toast: ToastService,
  ) { }

  ngOnInit(): void {
    this.loadRoles();
    this.loadTree();
  }

  private loadRoles(): void {
    this.apiDataService.GetAllPages(ApiRoutesConstants.ROLES_GET_List).subscribe({
      next: (roles: any[]) => {
        this.roles = roles.map((role) => ({ id: role.id, name: role.name ?? `Role #${role.id}` }));
        if (this.selectedRoleId == null && this.roles.length) {
          this.selectedRoleId = this.roles[0].id;
        }
      },
      error: (err: any) => {
        this.toast.error('Failed to load roles. Please try again.');
        console.error('Failed to load roles:', err);
      },
    });
  }

  loadTree(): void {
    this.isLoading = true;

    fetchFullModuleTree(this.apiDataService, ApiRoutesConstants.ROLES_PERMISSION_GET_List).subscribe({
      next: (modules) => {
        this.isLoading = false;
        this.tree = modules.map((module) => toMatrixNode(module));
        this.snapshot = structuredClone(this.tree);
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('Failed to load modules. Please try again.');
        console.error('Failed to load modules:', err);
      },
    });
  }

  onSearch(term: string): void {
    this.searchTerm = term;
  }

  toggleModule(node: MatrixModuleNode): void {
    if (this.selectedRoleId == null) return;
    cascadeSetRole(node, this.selectedRoleId, !hasRole(node.role_ids, this.selectedRoleId));
  }

  onToggleAction(event: ActionToggleEvent): void {
    if (this.selectedRoleId == null) return;
    const checked = !hasRole(event.action.role_ids, this.selectedRoleId);
    event.action.role_ids = setRole(event.action.role_ids, this.selectedRoleId, checked);
  }

  selectAllForRole(): void {
    if (this.selectedRoleId == null) return;
    this.tree.forEach((node) => cascadeSetRole(node, this.selectedRoleId!, true));
  }

  clearAllForRole(): void {
    if (this.selectedRoleId == null) return;
    this.tree.forEach((node) => cascadeSetRole(node, this.selectedRoleId!, false));
  }

  get dirtyCount(): number {
    return this.collectDirtyRoots().length;
  }

  /** A module's own row (checkbox + actions) or any of its nested sub-modules changing both
   *  count as "this module is dirty" - but only the root-level node goes into the dirty list,
   *  since buildModulePayloadFromNode() already sends its whole sub-module subtree in one
   *  payload. Flattening changed sub-modules into their own top-level "modules" entries too
   *  used to make bulkUpdate() process the same row twice: the parent's payload force-deletes
   *  and recreates all of its sub-modules (new ids), then the stale sub-module entry tried to
   *  findOrFail() its now-deleted old id and blew up with a "no query results" error. */
  private collectDirtyRoots(): MatrixModuleNode[] {
    return this.tree.filter((node, index) => this.nodeChanged(node, this.snapshot[index]));
  }

  private nodeChanged(node: MatrixModuleNode, snap: MatrixModuleNode | undefined): boolean {
    const ownChanged = node.role_ids !== snap?.role_ids;
    const actionsChanged = node.actions.some((action, ai) => action.role_ids !== snap?.actions?.[ai]?.role_ids);
    const subChanged = node.sub_modules.some((child, ci) => this.nodeChanged(child, snap?.sub_modules?.[ci]));

    return ownChanged || actionsChanged || subChanged;
  }

  save(): void {
    const dirty = this.collectDirtyRoots();

    if (!dirty.length) {
      this.toast.warning('No changes to save.');
      return;
    }

    this.isSaving = true;
    const payload = { modules: dirty.map((node) => buildModulePayloadFromNode(node)) };

    this.apiDataService.PUT(ApiRoutesConstants.ROLES_PERMISSION_BULK_UPDATE, payload).subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (isSuccessResponse(response)) {
          this.toast.success(`Updated permissions for ${dirty.length} module${dirty.length > 1 ? 's' : ''}.`);
        } else {
          this.toast.error(response?.message || 'Failed to save permissions. Please try again.');
        }

        this.loadTree();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.error(err?.error?.message || 'Failed to save permissions. Please try again.');
        console.error('Failed to save permissions:', err);
      },
    });
  }

  discard(): void {
    this.tree = structuredClone(this.snapshot);
  }

  /** Drag-and-drop reorders root modules - saved immediately via its own API call, independent
   *  of the "Save changes" role-assignment flow. The snapshot is reordered in lock-step so the
   *  index-based comparison in collectDirty() doesn't mistake moved (but otherwise unchanged)
   *  modules for role-assignment edits. */
  onRootDrop(event: CdkDragDrop<MatrixModuleNode[]>): void {
    if (event.previousIndex === event.currentIndex) return;

    moveItemInArray(this.tree, event.previousIndex, event.currentIndex);
    moveItemInArray(this.snapshot, event.previousIndex, event.currentIndex);

    const items = this.tree.map((node, index) => ({ id: node.id!, position: index }));

    this.apiDataService.PUT(ApiRoutesConstants.ROLES_PERMISSION_REORDER, { items }).subscribe({
      next: (response: any) => {
        if (isSuccessResponse(response)) {
          this.toast.success('Module order updated.');
        } else {
          this.toast.error(response?.message || 'Failed to update module order.');
          this.loadTree();
        }
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Failed to update module order.');
        console.error('Failed to reorder modules:', err);
        this.loadTree();
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/app/masters/roles-and-permission']);
  }
}
