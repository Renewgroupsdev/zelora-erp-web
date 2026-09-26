import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { collectRoleStates, hasRole, MatrixModuleNode, nodeMatchesSearch } from '../../roles-permission-data.util';
import { RolePermissionAction } from '../../roles-permission.model';

export interface ActionToggleEvent {
  node: MatrixModuleNode;
  action: RolePermissionAction;
}

/** Renders one module row plus its actions and sub_modules by recursing into itself, mirroring
 *  ModuleTreeNode's shape but with a checkbox (instead of edit/delete row actions) for granting
 *  the currently selected role access to this node - toggling bubbles up to the matrix screen,
 *  which owns the cascade/indeterminate logic in roles-permission-data.util. */
@Component({
  selector: 'app-matrix-tree-node',
  standalone: true,
  imports: [CommonModule, MatrixTreeNode],
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

  onToggle(): void {
    if (!this.hasExpandableContent) return;
    this.node.expanded = !this.node.expanded;
  }
}
