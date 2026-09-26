import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiDataService } from '../../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../../shared/common-services/toast.service';
import { isSuccessResponse, RolePermissionModule } from '../roles-permission.model';
import { ModuleFormNode } from './module-form-node/module-form-node';
import { buildModuleGroup, extractModulePayload } from './module-form.util';

/** Full-page (not dialog) add/edit for a module + its actions + its recursively nested
 *  sub-modules - the nested tree needs far more room than the app's usual 480px modal, and every
 *  node in the tree (top-level module or any sub-module) is edited through this same component,
 *  keyed off the `id` route param. */
@Component({
  selector: 'app-add-roles-permission-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModuleFormNode],
  templateUrl: './add-roles-permission-form.html',
  styleUrl: './add-roles-permission-form.scss',
})
export class AddRolesPermissionForm implements OnInit {
  rootGroup: FormGroup | null = null;

  isEdit = false;
  isLoading = false;
  isSaving = false;

  private moduleId: number | null = null;
  parentId: number | null = null;
  parentName: string | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private apiDataService: ApiDataService,
    private toast: ToastService,
  ) { }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.moduleId = idParam ? Number(idParam) : null;
    this.isEdit = !!this.moduleId;

    const parentIdParam = this.route.snapshot.queryParamMap.get('parentId');
    this.parentId = parentIdParam ? Number(parentIdParam) : null;
    this.parentName = this.route.snapshot.queryParamMap.get('parentName');

    if (this.isEdit) {
      this.loadModule(this.moduleId!);
    } else {
      this.rootGroup = buildModuleGroup(this.fb);
    }
  }

  private loadModule(id: number): void {
    this.isLoading = true;

    this.apiDataService.GET(`${ApiRoutesConstants.ROLES_PERMISSION_ADD}/${id}`).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        const module: RolePermissionModule | null = isSuccessResponse(response) ? response.data : null;

        if (!module) {
          this.toast.error('Failed to load module details.');
          this.rootGroup = buildModuleGroup(this.fb);
          return;
        }

        this.rootGroup = buildModuleGroup(this.fb, module);
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('Failed to load module details. Please try again.');
        console.error('Failed to load module details:', err);
        this.rootGroup = buildModuleGroup(this.fb);
      },
    });
  }

  get formTitle(): string {
    if (this.isEdit) return 'Edit Module & Permissions';
    if (this.parentName) return `Add Sub-Module under "${this.parentName}"`;
    return 'Add Module & Permissions';
  }

  get formSubtitle(): string {
    return 'Define module actions and nested sub-modules. Assign role access from the Assign Permissions screen.';
  }

  save(): void {
    if (!this.rootGroup) return;

    if (this.rootGroup.invalid) {
      this.rootGroup.markAllAsTouched();
      this.toast.warning('Please complete all required fields before saving.');
      return;
    }

    const payload: any = extractModulePayload(this.rootGroup);
    if (!this.isEdit && this.parentId) {
      payload.parent_id = this.parentId;
    }

    this.isSaving = true;

    const request = this.isEdit
      ? this.apiDataService.PUT(`${ApiRoutesConstants.ROLES_PERMISSION_ADD}/${this.moduleId}`, payload)
      : this.apiDataService.POST(ApiRoutesConstants.ROLES_PERMISSION_ADD, payload);

    request.subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (isSuccessResponse(response)) {
          this.toast.success(this.isEdit ? 'Module updated successfully' : 'Module saved successfully');
          this.goBack();
        } else {
          this.toast.error(response?.message || 'Failed to save module. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.error(err?.error?.message || 'Failed to save module. Please try again.');
        console.error('Failed to save module:', err);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/app/masters/roles-and-permission']);
  }
}
