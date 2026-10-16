import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IconPicker } from '../../../../../shared/components/icon-picker/icon-picker';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { buildActionGroup, buildModuleGroup, buildTabGroup, slugify } from '../module-form.util';
import { appRoutePaths, isAppRoute } from '../../../../../shared/utils/app-route.util';

/** One module node's form fields (name, slug, actions, sub-modules) - recurses into itself to
 *  render nested sub-modules, mirroring the API's arbitrarily-deep module tree. Role access is
 *  assigned separately on the Assign Permissions screen, not here. */
@Component({
  selector: 'app-module-form-node',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DragDropModule, ModuleFormNode, IconPicker],
  templateUrl: './module-form-node.html',
  styleUrl: './module-form-node.scss',
})
export class ModuleFormNode implements OnInit {
  @Input({ required: true }) group!: FormGroup;
  @Input() depth = 0;
  @Input() removable = false;

  @Output() removeRequested = new EventEmitter<void>();

  collapsed = false;
  private slugTouchedManually = false;

  private readonly router = inject(Router);

  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {
    this.slugTouchedManually = !!this.group.get('id')?.value;

    this.group.get('module_name')?.valueChanges.subscribe((name: string) => {
      if (this.slugTouchedManually) return;
      this.group.get('slug_name')?.setValue(slugify(name), { emitEvent: false });
    });
  }

  get actionsArray(): FormArray {
    return this.group.get('actions') as FormArray;
  }

  get subModulesArray(): FormArray {
    return this.group.get('sub_modules') as FormArray;
  }

  asFormGroup(control: AbstractControl): FormGroup {
    return control as FormGroup;
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
  }

  onSlugInput(): void {
    this.slugTouchedManually = true;
  }

  addAction(): void {
    this.actionsArray.push(buildActionGroup(this.fb));
  }

  removeAction(index: number): void {
    this.actionsArray.removeAt(index);
  }

  get tabsArray(): FormArray {
    return this.group.get('tabs') as FormArray;
  }

  addTab(): void {
    this.tabsArray.push(buildTabGroup(this.fb));
  }

  removeTab(index: number): void {
    this.tabsArray.removeAt(index);
  }

  /** Dragging a tab row reorders the FormArray itself - its order is what's saved as each tab's position. */
  onTabDrop(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    const controls = [...this.tabsArray.controls];
    moveItemInArray(controls, event.previousIndex, event.currentIndex);
    this.tabsArray.clear({ emitEvent: false });
    controls.forEach((control) => this.tabsArray.push(control, { emitEvent: false }));
    this.tabsArray.markAsDirty();
    this.tabsArray.updateValueAndValidity();
  }

  isTabInvalid(index: number, controlName: string): boolean {
    const control = this.tabsArray.at(index)?.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  /** The tab URL at this row is filled in but is not a page of this app - the tab strip hides such a tab. */
  unknownTabUrl(index: number): boolean {
    const url = this.tabsArray.at(index)?.get('url')?.value;
    return !!url?.trim() && !isAppRoute(this.router.config, url);
  }

  /** Names of the tabs whose URL is not a page of this app (warning under the tabs list). */
  get unknownTabUrls(): string[] {
    return this.tabsArray.controls
      .map((control, i) => (this.unknownTabUrl(i) ? control.get('tab_name')?.value || 'Unnamed tab' : null))
      .filter((name): name is string => !!name);
  }

  /** Real page URLs offered as suggestions in the tab URL fields, so a tab can't point at a missing page. */
  readonly appPagePaths = appRoutePaths(this.router.config).filter((path) => path.startsWith('/app/'));

  /** Unique id for this node's URL suggestion list (nodes nest, so a fixed id would repeat). */
  readonly pageListId = `tab-pages-${Math.random().toString(36).slice(2, 9)}`;

  addSubModule(): void {
    this.subModulesArray.push(buildModuleGroup(this.fb));
    this.collapsed = false;
  }

  removeSubModule(index: number): void {
    this.subModulesArray.removeAt(index);
  }

  isInvalid(controlName: string): boolean {
    const control = this.group.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  /** The module URL is not a page of this app (a typo here sends users to the 404 page). */
  get unknownUrl(): boolean {
    return !isAppRoute(this.router.config, this.group.get('url')?.value);
  }

  /** The action URL at this row is not a page of this app. */
  unknownActionUrl(index: number): boolean {
    return !isAppRoute(this.router.config, this.actionsArray.at(index)?.get('url')?.value);
  }

  /** Names of the actions whose URL is not a page of this app (summary under the actions list). */
  get unknownActionUrls(): string[] {
    return this.actionsArray.controls
      .map((control, i) => (this.unknownActionUrl(i) ? control.get('action_name')?.value || 'Unnamed action' : null))
      .filter((name): name is string => !!name);
  }

  isActionInvalid(index: number, controlName: string): boolean {
    const control = this.actionsArray.at(index)?.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
