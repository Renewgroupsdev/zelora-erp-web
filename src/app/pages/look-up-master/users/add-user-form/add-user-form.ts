import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../../shared/common-services/toast.service';

type UnitType = 'branch' | 'franchise';

/** A branch or franchise the user can belong to (GET /scope/options, see BranchOptionsService). */
export interface UserUnitOption {
  id: number;
  name: string;
  /** Name without the "(Franchise)" suffix. */
  shortName?: string;
  type?: UnitType | string;
}

export interface AddUserFormData {
  user: any | null;
  roles: { id: number; name: string; slug: string }[];
  branches: UserUnitOption[];
}

@Component({
  selector: 'app-add-user-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-user-form.html',
  styleUrl: './add-user-form.scss',
})
export class AddUserForm {
  userForm: FormGroup;
  isSaving = false;
  showPassword = false;
  /** Selected (not yet uploaded) avatar file, and the preview shown for it or for the saved photo. */
  photoFile: File | null = null;
  photoPreview: string | null = null;
  photoError = '';
  /** True when the user clicked Remove on a photo that is already saved - tells the API to clear it. */
  private photoRemoved = false;
  readonly roles;
  /** Every branch and franchise on offer (plus the user's current one, even if it is no longer active). */
  readonly units: UserUnitOption[];
  readonly unitTypes: { value: UnitType; label: string; icon: string }[] = [
    { value: 'branch', label: 'Branch', icon: 'bi-diagram-3' },
    { value: 'franchise', label: 'Franchise', icon: 'bi-shop' },
  ];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddUserForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: AddUserFormData
  ) {
    const user = data.user;
    this.roles = data.roles ?? [];
    this.units = AddUserForm.withCurrentUnit(data.branches ?? [], user);
    const unitId = user?.branch_or_franchise_id ?? '';
    // An id alone is ambiguous (branch 7 vs franchise 7): the saved type decides.
    const unitType = AddUserForm.typeOf(user?.branch_or_franchise_type) ?? 'branch';

    // The API always returns a URL (the default avatar when none is set); only preview a real upload.
    this.photoPreview = user?.profile_photo ? user.profile_photo_url : null;

    this.userForm = this.fb.group({
      name: [user?.name ?? '', [Validators.required, Validators.maxLength(150)]],
      email: [user?.email ?? '', [Validators.required, Validators.email, Validators.maxLength(150)]],
      // Required when creating; optional on edit (blank keeps the current password).
      password: ['', user ? [Validators.minLength(6)] : [Validators.required, Validators.minLength(6)]],
      password_confirmation: [''],
      role_id: [user?.role_id ?? '', Validators.required],
      user_type: [user?.user_type ?? 'management', Validators.required],
      // Branch or franchise first; the second dropdown then lists only units of that type.
      branch_or_franchise_type: [unitType, Validators.required],
      branch_or_franchise_id: [unitId, Validators.required],
      phone_no: [user?.phone_no ?? '', Validators.maxLength(20)],
      // Telephony extension - only used (and required) for the telecaller role.
      extension: [user?.telephony_extension?.extension ?? '', [Validators.maxLength(30), Validators.pattern(/^[A-Za-z0-9*#_-]+$/)]],
      device_type: [user?.telephony_extension?.device_type ?? 'sip'],
      sip_username: [user?.telephony_extension?.sip_username ?? '', Validators.maxLength(255)],
      sip_domain: [user?.telephony_extension?.sip_domain ?? '', Validators.maxLength(255)],
      status: [this.resolveStatus(user?.status), Validators.required],
    }, { validators: AddUserForm.passwordsMatch });

    this.userForm.get('role_id')?.valueChanges.subscribe(() => this.syncExtensionValidator());
    this.syncExtensionValidator();

    // Switching Branch <-> Franchise clears a unit of the other type.
    this.userForm.get('branch_or_franchise_type')?.valueChanges.subscribe(type => {
      const id = Number(this.userForm.get('branch_or_franchise_id')?.value);
      if (id && !this.unitsOfType(type).some(u => u.id === id)) {
        this.userForm.get('branch_or_franchise_id')?.setValue('');
      }
    });
  }

  get isEdit(): boolean {
    return !!this.data.user?.id;
  }

  get selectedUnitType(): UnitType {
    return AddUserForm.typeOf(this.userForm.get('branch_or_franchise_type')?.value) ?? 'branch';
  }

  /** Options of the second dropdown. */
  get typedUnits(): UserUnitOption[] {
    return this.unitsOfType(this.selectedUnitType);
  }

  unitsOfType(type: string): UserUnitOption[] {
    return this.units.filter(u => (AddUserForm.typeOf(u.type) ?? 'branch') === type);
  }

  setUnitType(type: UnitType): void {
    const control = this.userForm.get('branch_or_franchise_type');
    control?.setValue(type);
    control?.markAsTouched();
  }

  private static typeOf(value: unknown): UnitType | null {
    return value === 'branch' || value === 'franchise' ? value : null;
  }

  /** On edit, keep the user's current unit selectable even when it is not in the active list. */
  private static withCurrentUnit(units: UserUnitOption[], user: any): UserUnitOption[] {
    const id = Number(user?.branch_or_franchise_id);
    const type = AddUserForm.typeOf(user?.branch_or_franchise_type);
    if (!id || !type || units.some(u => u.id === id && u.type === type) || !user?.branch?.name) return units;
    return [...units, { id, name: user.branch.name, shortName: user.branch.name, type }];
  }

  /** Telecaller calls are routed to their extension, so it is mandatory for that role (and unused for others). */
  get isTelecallerRole(): boolean {
    const role = this.roles.find(r => r.id === Number(this.userForm?.get('role_id')?.value));
    return role?.slug === 'telecaller';
  }

  private syncExtensionValidator(): void {
    const extension = this.userForm.get('extension');
    const rules = [Validators.maxLength(30), Validators.pattern(/^[A-Za-z0-9*#_-]+$/)];
    extension?.setValidators(this.isTelecallerRole ? [Validators.required, ...rules] : rules);
    extension?.updateValueAndValidity({ emitEvent: false });
  }

  /** Confirm must equal the password whenever a password is being set (always on create, optional on edit). */
  private static passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirm = group.get('password_confirmation')?.value;
    return (password || confirm) && password !== confirm ? { passwordMismatch: true } : null;
  }

  get passwordMismatch(): boolean {
    const confirm = this.userForm.get('password_confirmation');
    return this.userForm.hasError('passwordMismatch') && !!(confirm?.dirty || confirm?.touched);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.photoError = 'Choose an image file (JPG, PNG, WebP).';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.photoError = 'Image must be 2 MB or smaller.';
      return;
    }

    this.photoError = '';
    this.photoRemoved = false;
    this.photoFile = file;
    const reader = new FileReader();
    reader.onload = () => (this.photoPreview = String(reader.result));
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.photoFile = null;
    this.photoPreview = null;
    this.photoRemoved = !!this.data.user?.profile_photo;
  }

  initials(): string {
    return (this.userForm.get('name')?.value || '?').trim().split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join('');
  }

  /** users.status is a 1/0 column. */
  private resolveStatus(status: unknown): number {
    const value = String(status ?? '').trim().toLowerCase();
    return value === 'inactive' || value === '0' ? 0 : 1;
  }

  saveUser(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const value = this.userForm.getRawValue();
    // Multipart so the avatar file can travel with the fields.
    const payload = new FormData();
    payload.append('name', value.name);
    payload.append('email', value.email);
    payload.append('role_id', String(value.role_id));
    payload.append('user_type', value.user_type);
    payload.append('branch_or_franchise_type', String(value.branch_or_franchise_type));
    payload.append('branch_or_franchise_id', String(value.branch_or_franchise_id));
    payload.append('phone_no', value.phone_no ?? '');
    payload.append('status', String(value.status));
    if (value.password) {
      payload.append('password', value.password);
      payload.append('password_confirmation', value.password_confirmation);
    }
    if (this.isTelecallerRole) {
      payload.append('extension', value.extension);
      payload.append('device_type', value.device_type || 'sip');
      payload.append('sip_username', value.sip_username || '');
      payload.append('sip_domain', value.sip_domain || '');
    }
    if (this.photoFile) payload.append('profile_photo', this.photoFile);
    else if (this.photoRemoved) payload.append('remove_profile_photo', '1');

    this.isSaving = true;

    const request = this.isEdit
      ? this.apiDataService.POST(`${ApiRoutesConstants.USER_ADD}/${this.data.user.id}`, this.withMethodPut(payload))
      : this.apiDataService.POST(ApiRoutesConstants.USER_ADD, payload);

    request.subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (response && response.success !== false) {
          this.toast.success(this.isEdit ? 'User updated successfully' : 'User created successfully');
          this.dialogRef.close(response.data ?? true);
        } else {
          this.toast.error(response?.message || 'Failed to save user. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        const firstError = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
        this.toast.error(firstError || err?.error?.message || 'Failed to save user. Please try again.');
        console.error('Failed to save user:', err);
      },
    });
  }

  /** PHP only parses multipart bodies on POST, so an update is a POST with Laravel's `_method` override. */
  private withMethodPut(payload: FormData): FormData {
    payload.append('_method', 'PUT');
    return payload;
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: string): boolean {
    const control = this.userForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
