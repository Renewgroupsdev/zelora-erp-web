import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RolePermissionAction, RolePermissionModule } from '../roles-permission.model';

export function slugify(value: string): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseRoleIds(roleIds?: string | null): number[] {
  if (!roleIds) return [];
  return roleIds
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => !Number.isNaN(value));
}

/** An action's slug is always derived from its name - unlike a module's slug (editable until the
 *  user types into it directly), the action slug field stays disabled for the row's entire life,
 *  so it re-derives on every action_name change with no manual-edit escape hatch. */
export function buildActionGroup(fb: FormBuilder, action?: RolePermissionAction): FormGroup {
  const group = fb.group({
    id: [action?.id ?? null],
    permission_id: [action?.permission_id ?? null],
    action_name: [action?.action_name ?? '', [Validators.required, Validators.maxLength(100)]],
    slug_name: [{ value: action?.slug_name ?? '', disabled: true }, Validators.maxLength(100)],
    url: [action?.url ?? '', Validators.maxLength(255)],
    logo: [action?.logo ?? '', Validators.maxLength(100)],
    permission: [action?.permission ?? 1, Validators.required],
    role_ids: [parseRoleIds(action?.role_ids)],
  });

  group.get('action_name')?.valueChanges.subscribe((name: string | null) => {
    group.get('slug_name')?.setValue(slugify(name ?? ''), { emitEvent: false });
  });

  return group;
}

/** Builds one module node's FormGroup, recursing into sub_modules so the whole nested tree
 *  (module -> actions + sub_modules -> actions + sub_modules -> ...) is a single reactive form.
 *  role_ids has no UI here (and so no validator) - it's carried through unchanged from whatever
 *  the Assign Permissions screen last set it to, since role access is assigned there, not here. */
export function buildModuleGroup(fb: FormBuilder, module?: RolePermissionModule): FormGroup {
  return fb.group({
    id: [module?.id ?? null],
    module_name: [module?.module_name ?? '', [Validators.required, Validators.maxLength(150)]],
    slug_name: [module?.slug_name ?? '', [Validators.required, Validators.maxLength(150)]],
    url: [module?.url ?? '', Validators.maxLength(255)],
    role_ids: [parseRoleIds(module?.role_ids)],
    actions: fb.array((module?.actions ?? []).map((action) => buildActionGroup(fb, action))),
    sub_modules: fb.array((module?.sub_modules ?? []).map((sub) => buildModuleGroup(fb, sub))),
  });
}

/** Walks a module FormGroup back into the plain nested payload shape the API expects,
 *  joining each node's selected role ids into the comma-separated string it was read as. */
export function extractModulePayload(group: FormGroup): any {
  const raw = group.getRawValue();
  const actionsArray = group.get('actions') as FormArray;
  const subModulesArray = group.get('sub_modules') as FormArray;

  return {
    ...(raw.id ? { id: raw.id } : {}),
    module_name: raw.module_name,
    slug_name: raw.slug_name,
    url: raw.url ? raw.url.trim() : null,
    role_ids: (raw.role_ids ?? []).join(','),
    actions: actionsArray.controls.map((control) => {
      const actionValue = control.getRawValue();
      return {
        ...(actionValue.id ? { id: actionValue.id } : {}),
        permission_id: actionValue.permission_id ?? null,
        action_name: actionValue.action_name,
        slug_name: actionValue.slug_name,
        url: actionValue.url ? actionValue.url.trim() : null,
        logo: actionValue.logo ? actionValue.logo.trim() : null,
        permission: Number(actionValue.permission),
        role_ids: (actionValue.role_ids ?? []).join(','),
      };
    }),
    sub_modules: subModulesArray.controls.map((control) => extractModulePayload(control as FormGroup)),
  };
}
