import { PhoneInput } from '../../../shared/directives/phone-input.directive';
import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { ToastService } from '../../../shared/common-services/toast.service';
import { ApiDataService } from '../../../core/http/api.service';
import { forkJoin } from 'rxjs/internal/observable/forkJoin';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { TelephonyService } from '../../../core/telephony/telephony.service';
import { AuthService } from '../../../core/auth/auth.service';
import { TelecallerRow } from '../../../core/telephony/telephony.models';
import { BranchOption, BranchOptionsService, parseUnitKey, unitKey } from '../../../shared/common-services/branch-options.service';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs/internal/observable/of';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-add-lead-form',
  standalone: true,
  imports: [PhoneInput, CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-lead-form.html',
  styleUrl: './add-lead-form.scss',
})
export class AddLeadForm implements OnInit{
  leadForm: FormGroup;
  isSaving = false;

  sourceOptions: any = [];

  readonly genderOptions = [
    {
      value: 'Male',
      label: 'Male',
      icon: 'bi-gender-male',
    },
    {
      value: 'Female',
      label: 'Female',
      icon: 'bi-gender-female',
    },
    {
      value: 'Other',
      label: 'Other',
      icon: 'bi-gender-ambiguous',
    },
  ];

   typeOptions: any = [];

   statusOptions: any = [];

   telecallerOptions: TelecallerRow[] = [];

  private readonly telephony = inject(TelephonyService);
  private readonly auth = inject(AuthService);
  readonly branchOptions = inject(BranchOptionsService);

  /** "Belongs To" toggle: which kind of unit the Branch / Franchise dropdown lists. */
  readonly unitTypes: { value: 'branch' | 'franchise'; label: string; icon: string }[] = [
    { value: 'branch', label: 'Branch', icon: 'bi-diagram-3' },
    { value: 'franchise', label: 'Franchise', icon: 'bi-shop' },
  ];
  readonly unitType = signal<'branch' | 'franchise'>('branch');
  /** Every active branch + franchise from the masters. */
  readonly allUnits = signal<BranchOption[]>([]);
  readonly unitList = computed(() => this.allUnits().filter(o => o.type === this.unitType()));

  setUnitType(type: 'branch' | 'franchise'): void {
    if (type === this.unitType()) return;
    this.unitType.set(type);
    const control = this.leadForm.get('branch_key');
    if (parseUnitKey(control?.value)?.type !== type) control?.setValue(this.unitList()[0]?.key ?? '');
  }

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddLeadForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    if (data?.branch_type === 'franchise') this.unitType.set('franchise');

    this.leadForm =this.fb.group({
      name: [data?.name ?? '', [Validators.maxLength(100)]],
      mobile_no: [data?.mobile_no ?? '',[Validators.required, Validators.pattern(/^[0-9]{10}$/)],],
      location: [data?.location ?? '', Validators.maxLength(200)],
      pincode: [data?.pincode ?? '', Validators.pattern(/^[0-9]{6}$/)],
      source: [data?.source_id ?? '', Validators.required],
      gender: [data?.gender ?? '', Validators.required],
      type: [data?.service_category_id ?? data?.category_id ?? '', Validators.required],
      sub_category: [data?.treatment_id ?? ''],
      status: [data?.status_id ?? '', Validators.required],
      reason: [data?.reason ?? '', Validators.maxLength(1000)],
      // "branch:9" / "franchise:7"; sent as branch_type + branch_id.
      branch_key: [unitKey(data?.branch_type, data?.branch_id)],
      assigned_to: [data?.assigned_to ?? null],
    })
  }

  ngOnInit(): void {
    // The dropdown lists every active branch / franchise of the masters (?every=1), not only the login's own.
    // A new lead starts on the login's own branch / franchise.
    this.branchOptions.load().subscribe(() => {
      this.apiDataService.GET(`${ApiRoutesConstants.SCOPE_OPTIONS}?every=1`).subscribe({
        next: (res: any) => {
          const data = res?.data ?? {};
          const toRows = (rows: any[], type: 'branch' | 'franchise'): BranchOption[] =>
            (rows ?? []).filter(r => Number(r?.id) > 0).map(r => ({
              id: Number(r.id), type, key: unitKey(type, r.id), name: r.name, shortName: r.short_name ?? r.name, code: r.code ?? '',
            }));
          const options = [...toRows(data.branches, 'branch'), ...toRows(data.franchises, 'franchise')];
          this.allUnits.set(options);

          const control = this.leadForm.get('branch_key');
          if (control?.value || this.ownTelecaller() || this.telephony.isTelecaller()) return;
          const own = this.branchOptions.scope()?.unit;
          const pick = (own ? options.find(o => o.key === unitKey(own.type, own.id)) : undefined)
            ?? (options.length === 1 ? options[0] : undefined);
          if (pick) {
            control?.setValue(pick.key);
            this.unitType.set(pick.type);
          }
        },
        error: () => this.toast.error('Could not load the branch / franchise list.'),
      });
    });
    this.loadTelecallers();
    this.applyPreloadedLookups();
    this.loadSubCategories();

    // Picking another category clears the previous sub-category and reloads the list for it.
    this.leadForm.get('type')?.valueChanges.subscribe(() => {
      this.leadForm.get('sub_category')?.setValue('');
      this.refreshSubCategoryOptions();
    });
  }

  /** Sub-categories of the selected service category (its treatments from Treatment Management). */
  subCategoryOptions: { id: number; name: string }[] = [];
  private treatmentsByCategory = new Map<string, { id: number; name: string }[]>();

  private loadSubCategories(): void {
    this.apiDataService.GetAllPages(ApiRoutesConstants.SERVICE_CATEGORY_TREE_LIST).subscribe({
      next: (categories: any[]) => {
        categories.forEach((category: any) =>
          this.treatmentsByCategory.set(
            String(category.id),
            (category.treatments ?? []).filter((t: any) => t.is_active).map((t: any) => ({ id: t.id, name: t.name })),
          ));

        // Edit: keep the saved sub-category while the options are filled in.
        const saved = this.leadForm.get('sub_category')?.value;
        this.refreshSubCategoryOptions();
        if (saved) this.leadForm.get('sub_category')?.setValue(saved, { emitEvent: false });
      },
      error: () => (this.subCategoryOptions = []),
    });
  }

  private refreshSubCategoryOptions(): void {
    const categoryId = String(this.leadForm.get('type')?.value ?? '');
    this.subCategoryOptions = this.treatmentsByCategory.get(categoryId) ?? [];
  }

  /**
   * The list page hands over the dropdown lists it has loaded so far. Straight after a page refresh they
   * can still be empty (the page is loading them), so anything missing is fetched here instead.
   */
  private applyPreloadedLookups(): void {
    const { sourceOptions, typeOptions, statusOptions } = this.data ?? {};
    const lists = { sources: sourceOptions ?? [], types: typeOptions ?? [], statuses: statusOptions ?? [] };

    if (lists.sources.length && lists.types.length && lists.statuses.length) {
      this.setLookups(lists.sources, lists.types, lists.statuses);
      return;
    }

    const fetchList = (route: string, current: any[]): Observable<any[]> =>
      current.length
        ? of(current)
        : this.apiDataService.GET(route).pipe(
            map((res: any) => (res?.data?.data ?? []) as any[]),
            catchError(() => of([] as any[])),
          );

    forkJoin({
      sources: fetchList(ApiRoutesConstants.Source_List_Options, lists.sources),
      types: fetchList(`${ApiRoutesConstants.Type_List_Options}/1`, lists.types),
      statuses: fetchList(ApiRoutesConstants.Status_List_Options, lists.statuses),
    }).subscribe(({ sources, types, statuses }) => this.setLookups(sources, types, statuses));
  }

  private setLookups(sources: any[], types: any[], statuses: any[]): void {
    this.sourceOptions = sources;
    // Service Category Type lists only the master's parent categories (a lead's saved one stays selectable on edit).
    const savedType = String(this.data?.service_category_id ?? this.data?.category_id ?? '');
    this.typeOptions = types.filter((t: any) => !t?.parent_id || String(t.id) === savedType);
    this.statusOptions = statuses;

    if (this.isEdit) {
      this.patchEditDropdowns();
    } else {
      this.applyNewLeadStatus();
    }
  }

  get isEdit(): boolean {
    return !!this.data?.id;
  }

  get showAssign(): boolean {
    // Every role sees the field (the agents list is already limited to the login's own unit unless it has every-unit access).
    return true;
  }

  /** True when a telecaller is logged in: they can only file leads under themselves. */
  readonly ownTelecaller = signal(false);

  private loadTelecallers(): void {
    const me = this.auth.currentUser();

    this.telephony.telecallers().subscribe({
      next: rows => {
        if (this.telephony.isTelecaller() && me?.id) {
          this.ownTelecaller.set(true);
          this.telecallerOptions = rows.filter(r => Number(r.id) === Number(me.id));
          if (!this.telecallerOptions.length) {
            this.telecallerOptions = [{ id: me.id, name: me.name } as TelecallerRow];
          }
          if (!this.isEdit) {
            this.leadForm.get('assigned_to')?.setValue(me.id);
            this.leadForm.get('assigned_to')?.disable();
          }
          // Branch is optional for a telecaller: no default unit.
          return;
        }
        this.telecallerOptions = rows;
      },
      error: () => (this.telecallerOptions = []),
    });
  }

  private applyNewLeadStatus(): void {
    const newLeadStatus = this.statusOptions.find(
      (status: any) => String(status?.name).toLowerCase() === 'new lead'
    );
    if (!newLeadStatus) return;

    this.statusOptions = [newLeadStatus];
    this.leadForm.get('status')?.setValue(newLeadStatus.id);
  }

  private patchEditDropdowns(): void {
    // Match by id first, then by the saved name (the list row may only carry the name).
    const source = this.resolveOptionId(this.sourceOptions, this.data?.source_id ?? this.data?.source_name ?? this.data?.source, 'source_name');
    if (source !== null) {
      this.leadForm.get('source')?.setValue(source);
    }

    const type = this.resolveOptionId(this.typeOptions, this.data?.service_category_id ?? this.data?.category_id ?? this.data?.service_category_name ?? this.data?.category, 'name');
    if (type !== null) {
      this.leadForm.get('type')?.setValue(type);
    }

    const status = this.resolveOptionId(this.statusOptions, this.data?.status_id ?? this.data?.status_name ?? this.data?.status, 'name');
    if (status !== null) {
      this.leadForm.get('status')?.setValue(status);
    }
  }

  private resolveOptionId(options: any[], rawValue: unknown, labelKey: string): number | string | null {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }

    const byId = options.find((option) => String(option.id) === String(rawValue));
    if (byId) {
      return byId.id;
    }

    const byLabel = options.find(
      (option) => String(option[labelKey]).toLowerCase() === String(rawValue).toLowerCase()
    );
    return byLabel ? byLabel.id : null;
  }

  saveLead(): void {
    if (this.leadForm.invalid) {
      this.leadForm.markAllAsTouched();
      // Errors show inline (red fields + messages); jump to the first invalid one.
      setTimeout(() => (document.querySelector('.lead-modal .is-invalid') as HTMLElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }

    const { branch_key, ...rest } = this.leadForm.getRawValue();
    const unit = parseUnitKey(branch_key);
    const formValue = { ...rest, branch_type: unit?.type ?? null, branch_id: unit?.id ?? null };

    this.isSaving = true;

    const request = this.isEdit
      ? this.apiDataService.PUT(`${ApiRoutesConstants.LEAD_ADD}/${this.data.id}`, formValue)
      : this.apiDataService.POST(ApiRoutesConstants.LEAD_ADD, formValue);

    request.subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (response && response.success !== false) {
          this.toast.success(this.isEdit ? 'Lead updated successfully' : 'Lead saved successfully');
          this.dialogRef.close(response.data ?? formValue);
        } else {
          this.toast.error(response || 'Failed to save lead. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.error(err?.error?.message || 'Failed to save lead. Please try again.');
        console.error('Failed to save lead:', err);
      },
    });
  }

  /** Characters used / allowed, for the counter under the Address and Reason boxes. */
  charCount(controlName: string): number {
    return String(this.leadForm.get(controlName)?.value ?? '').length;
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: string): boolean {
    const control = this.leadForm.get(controlName);
    return !!(
      control &&
      control.invalid &&
      (control.dirty || control.touched)
    );
  }
}
