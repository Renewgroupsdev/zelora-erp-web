import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { LookupOption, TreatmentManagementService, TreatmentPayload, TreatmentRecord } from '../../shared/common-services/treatment-management.service';
import { Breadcrumb } from '../../shared/components/breadcrumb/breadcrumb';
import { BreadcrumbItem } from '../../shared/models/common-components.model';
import { ToastService } from '../../shared/common-services/toast.service';

@Component({
  selector: 'app-treatment-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, Breadcrumb],
  templateUrl: './treatment-create.html',
  styleUrl: './treatment-create.scss',
})
export class TreatmentCreate implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly service = inject(TreatmentManagementService);

  /** Encrypted treatment id when editing / viewing. */
  editingId: string | null = null;
  readonly readOnly = this.route.snapshot.queryParamMap.get('mode') === 'view';

  readonly categories = signal<LookupOption[]>([]);
  readonly branches = signal<LookupOption[]>([]);
  readonly products = signal<LookupOption[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    treatment_category_id: [null as number | null, Validators.required],
    branch_id: [null as number | null, Validators.required],
    description: ['', Validators.maxLength(255)],
    default_sittings: [1, [Validators.required, Validators.min(1)]],
    amount: [0, [Validators.required, Validators.min(0)]],
    gstRate: [18, [Validators.required, Validators.min(0), Validators.max(100)]],
    product_id: [null as string | null, Validators.required],
    needed_product_qty: [null as number | null, Validators.min(1)],
    is_active: [true],
  });

  private readonly nameValue = toSignal(this.form.controls.name.valueChanges, { initialValue: this.form.controls.name.value });
  private readonly descriptionValue = toSignal(this.form.controls.description.valueChanges, { initialValue: this.form.controls.description.value });
  private readonly categoryValue = toSignal(this.form.controls.treatment_category_id.valueChanges, { initialValue: this.form.controls.treatment_category_id.value });
  private readonly sittingsValue = toSignal(this.form.controls.default_sittings.valueChanges, { initialValue: this.form.controls.default_sittings.value });
  private readonly amountValue = toSignal(this.form.controls.amount.valueChanges, { initialValue: this.form.controls.amount.value });
  private readonly gstRateValue = toSignal(this.form.controls.gstRate.valueChanges, { initialValue: this.form.controls.gstRate.value });
  private readonly productValue = toSignal(this.form.controls.product_id.valueChanges, { initialValue: this.form.controls.product_id.value });

  readonly previewName = computed(() => this.nameValue() || 'Your treatment name');
  readonly previewDescription = computed(() => this.descriptionValue() || 'Treatment description will appear here.');
  readonly previewSittings = computed(() => Number(this.sittingsValue()) || 1);
  readonly previewGstRate = computed(() => Number(this.gstRateValue()) || 0);
  readonly categoryName = computed(() => this.categories().find(c => c.id === this.categoryValue())?.name ?? 'Category');
  readonly productName = computed(() => this.products().find(p => p.id === this.productValue())?.name ?? 'No product');

  /** GST in rupees (rounded to 2dp - the API rejects more decimals). */
  readonly gstAmount = computed(() => this.round2((Number(this.amountValue()) || 0) * (Number(this.gstRateValue()) || 0) / 100));
  readonly total = computed(() => this.round2((Number(this.amountValue()) || 0) + this.gstAmount()));

  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: 'Dashboard', link: ['/app/dashboard'], icon: 'bi-house-fill' },
      { label: 'Treatment Management', link: ['/app/treatments'], icon: 'bi-heart-pulse-fill' },
      { label: this.editingId ? (this.readOnly ? 'View Treatment' : 'Edit Treatment') : 'Create Treatment' },
    ];
  }

  ngOnInit(): void {
    this.editingId = this.route.snapshot.queryParamMap.get('id');
    this.loading.set(true);

    forkJoin({
      categories: this.service.categories(),
      branches: this.service.branches(),
      products: this.service.products(),
    }).subscribe(({ categories, branches, products }) => {
      this.categories.set(categories);
      this.branches.set(branches);
      this.products.set(products);

      if (this.editingId) {
        this.loadTreatment(this.editingId);
      } else {
        this.loading.set(false);
        this.applyReadOnly();
      }
    });
  }

  private loadTreatment(id: string): void {
    this.service.get(id).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        if (!res?.success) {
          this.toast.error('Treatment not found', res?.message || 'Please try again.');
          this.router.navigate(['/app/treatments']);
          return;
        }
        this.patchTreatment(res.data as TreatmentRecord);
        this.applyReadOnly();
      },
      error: (err: any) => {
        this.loading.set(false);
        this.toast.error('Failed to load treatment', err?.error?.message || 'Please try again.');
        this.router.navigate(['/app/treatments']);
      },
    });
  }

  private applyReadOnly(): void {
    if (this.readOnly) this.form.disable({ emitEvent: false });
  }

  private patchTreatment(t: TreatmentRecord): void {
    const amount = Number(t.amount) || 0;
    const gst = Number(t.gst) || 0;
    this.form.patchValue({
      name: t.name,
      treatment_category_id: t.category?.id ?? null,
      branch_id: t.branch?.id ?? null,
      description: t.description ?? '',
      default_sittings: t.default_sittings,
      amount,
      gstRate: amount > 0 ? this.round2(gst / amount * 100) : 18,
      product_id: t.product?.id ?? null,
      needed_product_qty: t.needed_product_qty,
      is_active: t.is_active,
    });
  }

  invalid(control: AbstractControl | null | undefined): boolean {
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  save(): void {
    if (this.readOnly || this.saving()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: TreatmentPayload = {
      treatment_category_id: Number(raw.treatment_category_id),
      branch_id: Number(raw.branch_id),
      name: (raw.name ?? '').trim(),
      description: (raw.description ?? '').trim(),
      amount: this.round2(Number(raw.amount) || 0),
      gst: this.gstAmount(),
      default_sittings: Number(raw.default_sittings),
      product_id: raw.product_id!,
      needed_product_qty: raw.needed_product_qty ? Number(raw.needed_product_qty) : null,
      is_active: !!raw.is_active,
    };

    this.saving.set(true);
    const request$ = this.editingId ? this.service.update(this.editingId, payload) : this.service.create(payload);

    request$.subscribe({
      next: (res: any) => {
        this.saving.set(false);
        if (!res?.success) {
          this.toast.error('Save failed', res?.message || 'Please try again.');
          return;
        }
        this.toast.success(
          this.editingId ? 'Treatment updated' : 'Treatment created',
          this.editingId
            ? `${payload.name} has been updated successfully.`
            : `${payload.name} has been added to Treatment Management.`,
        );
        this.router.navigate(['/app/treatments']);
      },
      error: (err: any) => {
        this.saving.set(false);
        const errors = err?.error?.errors as Record<string, string[]> | undefined;
        const firstError = errors ? Object.values(errors)[0]?.[0] : undefined;
        this.toast.error('Save failed', firstError || err?.error?.message || 'Please try again.');
        console.error('Failed to save treatment:', err);
      },
    });
  }

  reset(): void {
    this.form.reset({
      name: '',
      treatment_category_id: null,
      branch_id: null,
      description: '',
      default_sittings: 1,
      amount: 0,
      gstRate: 18,
      product_id: null,
      needed_product_qty: null,
      is_active: true,
    });
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
