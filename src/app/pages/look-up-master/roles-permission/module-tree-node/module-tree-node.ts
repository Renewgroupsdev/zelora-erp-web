import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnDestroy, Output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { DisplayModuleNode, RolePermissionAction } from '../roles-permission.model';
import { parseRoleIds } from '../add-roles-permission-form/module-form.util';
import { CanActionDirective } from '../../../../shared/directives/can-action.directive';

export interface ModuleReorderEvent {
  items: { id: number; position: number }[];
}

export type HoverPopoverKind = 'roles' | 'actions';

interface RoleAccessSummary {
  id: number;
  name: string;
  actions: RolePermissionAction[];
}

/** Renders one module row plus its sub_modules by recursing into itself - the API tree can
 *  nest arbitrarily deep, so a fixed 2-level template (like service-category's) can't express it.
 *
 *  Each node owns a cdkDropList over its own node.sub_modules - never connected to any other
 *  node's list via cdkDropListConnectedTo - so dragging a sub-module can only reorder it among
 *  its own siblings under the same parent, and can't drop it into a different parent's list. */
@Component({
  selector: 'app-module-tree-node',
  standalone: true,
  imports: [CommonModule, DragDropModule, ModuleTreeNode, CanActionDirective],
  templateUrl: './module-tree-node.html',
  styleUrl: './module-tree-node.scss',
})
export class ModuleTreeNode implements OnDestroy {
  @Input({ required: true }) node!: DisplayModuleNode;
  @Input() level = 0;
  /** True while a search filter is active - dragging is disabled then, since the visible list
   *  is a filtered subset and array indices wouldn't map to real sibling positions. */
  @Input() searchActive = false;

  @Output() editNode = new EventEmitter<DisplayModuleNode>();
  @Output() addChildNode = new EventEmitter<DisplayModuleNode>();
  @Output() deleteNode = new EventEmitter<DisplayModuleNode>();
  @Output() openUrl = new EventEmitter<DisplayModuleNode>();
  /** Bubbles a completed sub-module reorder up to the page component, which is the only layer
   *  that holds the API service - each intermediate level just re-emits it unchanged. */
  @Output() reorderChildren = new EventEmitter<ModuleReorderEvent>();

  /** Which chip's hover popover is open. It's position: fixed (anchored to the chip's viewport
   *  rect) because the module tree's scroll container would clip an absolutely positioned one. */
  popoverKind: HoverPopoverKind | null = null;
  popoverTop = 0;
  popoverLeft = 0;
  popoverAbove = false;
  popoverArrowLeft = 18;
  roleAccess: RoleAccessSummary[] = [];
  private popoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

  get allowedActionsCount(): number {
    return this.node.actions.filter((action) => Number(action.permission) === 1).length;
  }

  /** An action is usable by a role when it's enabled and either scoped to that role, or has no
   *  role_ids of its own (it then inherits the module's roles - see RolePermissionAction). */
  private actionsForRole(roleId: number): RolePermissionAction[] {
    return this.node.actions.filter((action) => {
      if (Number(action.permission) !== 1) return false;
      const actionRoleIds = parseRoleIds(action.role_ids);
      return !actionRoleIds.length || actionRoleIds.includes(roleId);
    });
  }

  isActionAllowed(action: RolePermissionAction): boolean {
    return Number(action.permission) === 1;
  }

  openPopover(kind: HoverPopoverKind, event: MouseEvent | FocusEvent): void {
    this.cancelPopoverClose();
    if (kind === 'roles') {
      this.roleAccess = this.node.roles.map((role) => ({ ...role, actions: this.actionsForRole(role.id) }));
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const popoverWidth = Math.min(360, window.innerWidth - 16);
    this.popoverAbove = rect.bottom > window.innerHeight * 0.6;
    this.popoverTop = this.popoverAbove ? rect.top - 10 : rect.bottom + 10;
    this.popoverLeft = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8));
    // Keep the arrow pointing at the chip even when the popover is shifted to stay on screen.
    this.popoverArrowLeft = Math.max(14, Math.min(rect.left + 18 - this.popoverLeft, popoverWidth - 22));
    this.popoverKind = kind;
    // scroll doesn't bubble out of the tree's own scroll container, so listen in capture phase.
    window.addEventListener('scroll', this.onViewportChange, true);
  }

  /** Closing is delayed slightly so the pointer can travel from the chip into the popover
   *  (to scroll a long list) without it disappearing. */
  schedulePopoverClose(): void {
    this.cancelPopoverClose();
    this.popoverCloseTimer = setTimeout(() => this.closePopover(), 120);
  }

  private closePopover(): void {
    this.popoverKind = null;
    window.removeEventListener('scroll', this.onViewportChange, true);
  }

  cancelPopoverClose(): void {
    if (this.popoverCloseTimer) {
      clearTimeout(this.popoverCloseTimer);
      this.popoverCloseTimer = null;
    }
  }

  /** A fixed popover would drift away from its chip once the page scrolls, so just close it.
   *  Arrow function so the same reference can be removed from window. */
  private onViewportChange = (event: Event): void => {
    // Scrolling inside the popover's own list shouldn't close it.
    if ((event.target as HTMLElement | null)?.closest?.('.hover-popover')) return;
    if (this.popoverKind) this.closePopover();
  };

  @HostListener('window:resize')
  onResize(): void {
    if (this.popoverKind) this.closePopover();
  }

  ngOnDestroy(): void {
    this.cancelPopoverClose();
    window.removeEventListener('scroll', this.onViewportChange, true);
  }

  onChildrenDrop(event: CdkDragDrop<DisplayModuleNode[]>): void {
    if (event.previousIndex === event.currentIndex) return;

    moveItemInArray(this.node.sub_modules, event.previousIndex, event.currentIndex);
    const items = this.node.sub_modules.map((child, index) => ({ id: child.id!, position: index }));
    this.reorderChildren.emit({ items });
  }

  onToggle(): void {
    if (!this.node.sub_modules.length) return;
    this.node.expanded = !this.node.expanded;
  }

  onEdit(event: Event): void {
    event.stopPropagation();
    this.editNode.emit(this.node);
  }

  onAddChild(event: Event): void {
    event.stopPropagation();
    this.addChildNode.emit(this.node);
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.deleteNode.emit(this.node);
  }

  onOpenUrl(event: Event): void {
    event.stopPropagation();
    if (!this.node.url) return;
    this.openUrl.emit(this.node);
  }
}
