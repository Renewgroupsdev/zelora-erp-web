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

  /** Report groups left open in the actions list (keyed by the report's key). Closed by default. */
  openReports = new Set<string>();

  /**
   * The actions list laid out for display: a report's "View ... Report" action is the parent, and its inner permissions (records,
   * analytics, contact details, export) are its children. Every other action stays a plain row. Indexes point into the form array,
   * so the form data and the save payload are untouched.
   */
  get actionLayout(): { index: number; key?: string; children: number[] }[] {
    const controls = this.actionsArray.controls;
    const slugs = controls.map((c) => (c.get('slug_name')?.value ?? '') as string);
    const parentOf = new Map<string, number>();
    slugs.forEach((s, i) => {
      const m = /^view-(.+)-report$/.exec(s);
      if (m && !parentOf.has(m[1])) parentOf.set(m[1], i);
    });
    const childKey = (s: string): string | null => {
      const m = /^view-(.+)-(?:records|analytics|contact-details)$/.exec(s) ?? /^export-(.+)-report$/.exec(s);
      return m && parentOf.has(m[1]) ? m[1] : null;
    };
    const kids = new Map<string, number[]>();
    const out: { index: number; key?: string; children: number[] }[] = [];
    slugs.forEach((s, i) => {
      const k = childKey(s);
      if (k) kids.set(k, [...(kids.get(k) ?? []), i]);
    });
    slugs.forEach((s, i) => {
      if (childKey(s)) return;
      const m = /^view-(.+)-report$/.exec(s);
      const key = m && parentOf.get(m[1]) === i ? m[1] : undefined;
      out.push({ index: i, key, children: key ? kids.get(key) ?? [] : [] });
    });
    // A group sits where its earliest member sits (so "Export Appointment Report" listed first keeps Appointment first).
    const pos = (g: { index: number; children: number[] }) => Math.min(g.index, ...g.children);
    // Reports follow the order of their tabs (Tabs section); other actions come after, in list order.
    const tabSlugs = this.tabsArray.controls.map((c) => c.get('slug_name')?.value as string);
    const rank = (g: { index: number; key?: string; children: number[] }) => {
      const t = g.key ? tabSlugs.indexOf(`view-${g.key}-report`) : -1;
      return t >= 0 ? t : 10000 + pos(g);
    };
    return out.sort((a, b) => rank(a) - rank(b));
  }

  /** A report's title in the actions list: its tab name, else its action name. */
  reportTitle(key: string, actionIndex: number): string {
    const tab = this.tabsArray.controls.find((c) => c.get('slug_name')?.value === `view-${key}-report`);
    return tab?.get('tab_name')?.value || this.actionLabel(actionIndex);
  }

  reportIcon(actionIndex: number): string {
    return this.actionsArray.at(actionIndex)?.get('logo')?.value || 'bi-bar-chart-fill';
  }

  toggleReport(key: string): void {
    this.openReports.has(key) ? this.openReports.delete(key) : this.openReports.add(key);
    this.openReports = new Set(this.openReports);
  }

  actionLabel(index: number): string {
    return this.actionsArray.at(index)?.get('action_name')?.value || 'Unnamed action';
  }
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
