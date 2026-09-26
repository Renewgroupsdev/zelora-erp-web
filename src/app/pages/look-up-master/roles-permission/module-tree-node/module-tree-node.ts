import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { DisplayModuleNode } from '../roles-permission.model';

export interface ModuleReorderEvent {
  items: { id: number; position: number }[];
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
  imports: [CommonModule, DragDropModule, ModuleTreeNode],
  templateUrl: './module-tree-node.html',
  styleUrl: './module-tree-node.scss',
})
export class ModuleTreeNode {
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

  get allowedActionsCount(): number {
    return this.node.actions.filter((action) => Number(action.permission) === 1).length;
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
