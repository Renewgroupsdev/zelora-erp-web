import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { collectRoleStates, hasRole, MatrixModuleNode, nodeMatchesSearch } from '../../roles-permission-data.util';
import { RolePermissionAction } from '../../roles-permission.model';

export interface ActionToggleEvent {
  node: MatrixModuleNode;
  action: RolePermissionAction;
}

export interface MatrixReorderEvent {
  items: { id: number; position: number }[];
}

/** Renders one module row plus its actions and sub_modules by recursing into itself, mirroring
 *  ModuleTreeNode's shape but with a checkbox (instead of edit/delete row actions) for granting
 *  the currently selected role access to this node - toggling bubbles up to the matrix screen,
 *  which owns the cascade/indeterminate logic in roles-permission-data.util.
 *
 *  Each node owns a cdkDropList over its own node.sub_modules - never connected to any other
 *  node's list - so dragging a sub-module can only reorder it among its own siblings under the
 *  same parent, matching ModuleTreeNode's sub-module reordering on the plain roles-permission page. */
@Component({
  selector: 'app-matrix-tree-node',
  standalone: true,
  imports: [CommonModule, DragDropModule, MatrixTreeNode],
  templateUrl: './matrix-tree-node.html',
  styleUrl: './matrix-tree-node.scss',
})
export class MatrixTreeNode {
  @Input({ required: true }) node!: MatrixModuleNode;
  @Input() level = 0;
  @Input() selectedRoleId: number | null = null;
  @Input() searchTerm = '';

  @Output() toggleModule = new EventEmitter<MatrixModuleNode>();
  @Output() toggleAction = new EventEmitter<ActionToggleEvent>();
  /** Bubbles a completed sub-module reorder up to the matrix screen, which is the only layer
   *  that holds the API service - each intermediate level just re-emits it unchanged. */
  @Output() reorderChildren = new EventEmitter<MatrixReorderEvent>();

  get isVisible(): boolean {
    return nodeMatchesSearch(this.node, this.searchTerm.trim().toLowerCase());
  }

  get isChecked(): boolean {
    return hasRole(this.node.role_ids, this.selectedRoleId);
  }

  get isIndeterminate(): boolean {
    if (this.selectedRoleId == null) return false;
    const states: boolean[] = [];
    collectRoleStates(this.node, this.selectedRoleId, states);
    return states.some(Boolean) && !states.every(Boolean);
  }

  isActionChecked(action: RolePermissionAction): boolean {
    return hasRole(action.role_ids, this.selectedRoleId);
  }

  /** While a search is active, force this node's actions/sub-modules open so a match
   *  nested several levels down is never hidden behind a collapsed ancestor. */
  get showChildren(): boolean {
    return this.node.expanded || !!this.searchTerm.trim();
  }

  get hasExpandableContent(): boolean {
    return !!(this.node.sub_modules.length || this.node.actions.length);
  }

  /** Dragging is disabled while a search filter is active, since the visible list is a filtered
   *  subset and array indices wouldn't map to real sibling positions. */
  get dragDisabled(): boolean {
    return !!this.searchTerm.trim();
  }

  onToggle(): void {
    if (!this.hasExpandableContent) return;
    this.node.expanded = !this.node.expanded;
  }

  onChildrenDrop(event: CdkDragDrop<MatrixModuleNode[]>): void {
    if (event.previousIndex === event.currentIndex) return;

    moveItemInArray(this.node.sub_modules, event.previousIndex, event.currentIndex);
    const items = this.node.sub_modules.map((child, index) => ({ id: child.id!, position: index }));
    this.reorderChildren.emit({ items });
  }
}
