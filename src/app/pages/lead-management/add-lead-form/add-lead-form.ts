import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, inject } from '@angular/core';
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
import { TelecallerRow } from '../../../core/telephony/telephony.models';

@Component({
  selector: 'app-add-lead-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
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

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddLeadForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.leadForm = this.fb.group({
      name: [data?.name ?? '', [Validators.required, Validators.maxLength(100)]],
      mobile_no: [data?.mobile_no ?? '',[Validators.required, Validators.maxLength(12), Validators.pattern(/^[0-9]{10}$/)],],
      location: [data?.location ?? '', Validators.maxLength(250)],
      pincode: [data?.pincode ?? '', Validators.maxLength(100)],
      source: [data?.source_id ?? '', Validators.required],
      gender: [data?.gender ?? '', Validators.required],
      type: [data?.service_category_id ?? data?.category_id ?? '', Validators.required],
      status: [data?.status_id ?? '', Validators.required],
      reason: [data?.reason ?? '', Validators.maxLength(250)],
      organization_id: ['1'],
      assigned_to: [data?.assigned_to ?? null],
    })
  }

  ngOnInit(): void {
    this.loadScheduleData();
    this.loadTelecallers();
  }

  /** `data` may also be a prefill for a new lead (e.g. { mobile_no } from an unknown caller). */
  get isEdit(): boolean {
    return !!this.data?.id;
  }

  /** Supervisors pick the owning telecaller; telecallers never see this field. */
  get showAssign(): boolean {
    return !this.telephony.isTelecaller() && this.telecallerOptions.length > 0;
  }

  private loadTelecallers(): void {
    this.telephony.telecallers().subscribe({
      next: rows => (this.telecallerOptions = rows),
      error: () => (this.telecallerOptions = []),
    });
  }

  loadScheduleData(): void {


    forkJoin({

      sourceOption: this.apiDataService.GET(ApiRoutesConstants.Source_List_Options),

      typeOption: this.apiDataService.GET(ApiRoutesConstants.Type_List_Options+`/2`),

      statusOption: this.apiDataService.GET(ApiRoutesConstants.Status_List_Options),


    }).subscribe({

      next: (response: any) => {

        this.sourceOptions = response.sourceOption?.data.data ?? [];
        this.typeOptions = response.typeOption?.data.data ?? [];
        this.statusOptions = response.statusOption?.data.data ?? [];

        if (this.isEdit) {
          this.patchEditDropdowns();
        }

      },

      error: (error) => {


        console.error('API loading failed:', error);

      }

    });

  }


  /** The lookup APIs load after the form controls are seeded, and the raw lead record's
   *  source/category/status fields aren't guaranteed to already be the lookup `id` - so once
   *  each option list arrives, re-resolve the stored value against it. */
  private patchEditDropdowns(): void {
    const source = this.resolveOptionId(this.sourceOptions, this.data?.source_id, 'source_name');
    if (source !== null) {
      this.leadForm.get('source')?.setValue(source);
    }

    const type = this.resolveOptionId(this.typeOptions, this.data?.service_category_id ?? this.data?.category_id, 'name');
    if (type !== null) {
      this.leadForm.get('type')?.setValue(type);
    }

    const status = this.resolveOptionId(this.statusOptions, this.data?.status_id, 'name');
    if (status !== null) {
      this.leadForm.get('status')?.setValue(status);
    }
  }

  /** Matches a stored value against a lookup list's `id` first, falling back to its label
   *  (case-insensitive) in case the backend sent the name/slug instead of the id. */
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
      return;
    }

    const formValue = this.leadForm.getRawValue();

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
