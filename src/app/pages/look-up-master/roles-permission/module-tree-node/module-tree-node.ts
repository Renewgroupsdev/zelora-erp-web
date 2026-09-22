import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DisplayModuleNode } from '../roles-permission.model';

/** Renders one module row plus its sub_modules by recursing into itself - the API tree can
 *  nest arbitrarily deep, so a fixed 2-level template (like service-category's) can't express it. */
@Component({
  selector: 'app-module-tree-node',
  standalone: true,
  imports: [CommonModule, ModuleTreeNode],
  templateUrl: './module-tree-node.html',
  styleUrl: './module-tree-node.scss',
})
export class ModuleTreeNode {
  @Input({ required: true }) node!: DisplayModuleNode;
  @Input() level = 0;

  @Output() editNode = new EventEmitter<DisplayModuleNode>();
  @Output() addChildNode = new EventEmitter<DisplayModuleNode>();
  @Output() deleteNode = new EventEmitter<DisplayModuleNode>();
  @Output() openUrl = new EventEmitter<DisplayModuleNode>();

  get allowedActionsCount(): number {
    return this.node.actions.filter((action) => Number(action.permission) === 1).length;
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
