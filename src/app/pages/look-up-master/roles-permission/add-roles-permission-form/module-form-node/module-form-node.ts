import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { IconPicker } from '../../../../../shared/components/icon-picker/icon-picker';
import { RoleOption } from '../../roles-permission.model';
import { buildActionGroup, buildModuleGroup, slugify } from '../module-form.util';

/** One module node's form fields (name, slug, role access, actions, sub-modules) - recurses into
 *  itself to render nested sub-modules, mirroring the API's arbitrarily-deep module tree. */
@Component({
  selector: 'app-module-form-node',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModuleFormNode, IconPicker],
  templateUrl: './module-form-node.html',
  styleUrl: './module-form-node.scss',
})
export class ModuleFormNode implements OnInit {
  @Input({ required: true }) group!: FormGroup;
  @Input() roles: RoleOption[] = [];
  @Input() depth = 0;
  @Input() removable = false;

  @Output() removeRequested = new EventEmitter<void>();

  collapsed = false;
  private slugTouchedManually = false;

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

  isRoleSelected(roleId: number): boolean {
    const selected: number[] = this.group.get('role_ids')?.value ?? [];
    return selected.includes(roleId);
  }

  toggleRole(roleId: number): void {
    const control = this.group.get('role_ids');
    const current: number[] = control?.value ?? [];
    const next = current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId];

    control?.setValue(next);
    control?.markAsTouched();
  }

  addAction(): void {
    this.actionsArray.push(buildActionGroup(this.fb));
  }

  removeAction(index: number): void {
    this.actionsArray.removeAt(index);
  }

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

  isActionInvalid(index: number, controlName: string): boolean {
    const control = this.actionsArray.at(index)?.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
