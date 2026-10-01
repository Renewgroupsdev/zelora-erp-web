import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { DiscountType, LookupOption, TreatmentManagementService, TreatmentPayload, TreatmentRecord } from '../../shared/common-services/treatment-management.service';
import { Breadcrumb } from '../../shared/components/breadcrumb/breadcrumb';
import { PageLoader } from '../../shared/components/page-loader/page-loader';
import { BreadcrumbItem } from '../../shared/models/common-components.model';
import { ToastService } from '../../shared/common-services/toast.service';

@Component({
  selector: 'app-treatment-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, Breadcrumb, PageLoader],
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
    price: [0, [Validators.required, Validators.min(0)]],
    discount: [0, [Validators.min(0)]],
    discountType: ['percentage' as DiscountType, Validators.required],
    gstRate: [18, [Validators.required, Validators.min(0), Validators.max(100)]],
    maxSessions: [1, [Validators.required, Validators.min(1)]],
    is_active: [true],
    comboTreatments: this.fb.array([]),
    // View / Edit start with no rows - the saved rows are added when the treatment arrives, so a
    // blank default row never flashes (or stays) while it loads. Create starts with one empty row.
    materials: this.fb.array(
      (this.route.snapshot.queryParamMap.get('id') ? [] : [this.createMaterial()]) as any[],
    ),
  });

  private readonly categoryId = toSignal(this.form.controls.treatment_category_id.valueChanges, {
    initialValue: this.form.controls.treatment_category_id.value,
  });

  /** The API has a category named "Combo" - picking it switches the form to a bundle of treatments. */
  readonly isCombo = computed(() => this.isComboCategory(this.categoryId()));
  readonly categoryName = computed(() => this.categories().find(c => c.id === this.categoryId())?.name ?? 'Category');

  private readonly nameValue = toSignal(this.form.controls.name.valueChanges, { initialValue: this.form.controls.name.value });
  private readonly descriptionValue = toSignal(this.form.controls.description.valueChanges, { initialValue: this.form.controls.description.value });
  private readonly sessionsValue = toSignal(this.form.controls.maxSessions.valueChanges, { initialValue: this.form.controls.maxSessions.value });
  private readonly priceValue = toSignal(this.form.controls.price.valueChanges, { initialValue: this.form.controls.price.value });
  private readonly discountValue = toSignal(this.form.controls.discount.valueChanges, { initialValue: this.form.controls.discount.value });
  private readonly discountTypeValue = toSignal(this.form.controls.discountType.valueChanges, { initialValue: this.form.controls.discountType.value });
  private readonly gstRateValue = toSignal(this.form.controls.gstRate.valueChanges, { initialValue: this.form.controls.gstRate.value });
  private readonly materialCount = signal(1);

  readonly previewName = computed(() => this.nameValue() || 'Your treatment name');
  readonly previewDescription = computed(() => this.descriptionValue() || 'Treatment description will appear here.');
  readonly previewSessions = computed(() => Number(this.sessionsValue()) || 1);
  readonly previewGstRate = computed(() => Number(this.gstRateValue()) || 0);
  readonly previewMaterials = computed(() => this.materialCount());

  readonly subtotal = computed(() => {
    const price = Number(this.priceValue()) || 0;
    const discount = Number(this.discountValue()) || 0;
    return Math.max(0, price - (this.discountTypeValue() === 'percentage'
      ? price * Math.min(discount, 100) / 100
      : discount));
  });

  readonly gstAmount = computed(() => this.subtotal() * (Number(this.gstRateValue()) || 0) / 100);
  readonly total = computed(() => this.subtotal() + this.gstAmount());

  readonly originalTotal = computed(() => {
    const price = Number(this.priceValue()) || 0;
    const gstRate = Number(this.gstRateValue()) || 0;
    return price + (price * gstRate / 100);
  });

  readonly hasDiscount = computed(() => this.originalTotal() > this.total());

  readonly discountPercent = computed(() => {
    const original = this.originalTotal();
    return original > 0 ? Math.round((1 - this.total() / original) * 100) : 0;
  });

  get materials(): FormArray { return this.form.controls.materials; }
  get comboTreatments(): FormArray { return this.form.controls.comboTreatments; }

  createMaterial(productId: number | null = null, unit = '', quantity = 1) {
    return this.fb.group({
      product_id: [productId, Validators.required],
      unit: [unit, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(0.01)]],
    });
  }

  createComboItem(name = '', price: number | null = null) {
    return this.fb.group({
      name: [name, Validators.required],
      price: [price, [Validators.required, Validators.min(0)]],
    });
  }

  get breadcrumbItems(): BreadcrumbItem[] {
    return [
      { label: 'Dashboard', link: ['/app/dashboard'], icon: 'bi-house-fill' },
      { label: 'Treatment Management', link: ['/app/treatments'], icon: 'bi-heart-pulse-fill' },
      { label: this.editingId ? (this.readOnly ? 'View Treatment' : 'Edit Treatment') : 'Create Treatment' },
    ];
  }

  invalid(control: AbstractControl | null | undefined): boolean {
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  addMaterial(): void {
    const last = this.materials.at(this.materials.length - 1) as FormGroup | undefined;
    if (last && last.invalid) {
      last.markAllAsTouched();
      this.toast.warning('Complete this item first', 'Select a product and fill in the unit and quantity before adding another.');
      return;
    }
    this.materials.push(this.createMaterial());
    this.materialCount.set(this.materials.length);
  }

  removeMaterial(index: number): void {
    if (this.materials.length > 1) this.materials.removeAt(index);
    this.materialCount.set(this.materials.length);
  }

  addComboTreatment(): void {
    const last = this.comboTreatments.at(this.comboTreatments.length - 1) as FormGroup | undefined;
    if (last && last.invalid) {
      last.markAllAsTouched();
      this.toast.warning('Complete this treatment first', 'Fill in the treatment name and price before adding another.');
      return;
    }
    this.comboTreatments.push(this.createComboItem());
  }

  removeComboTreatment(index: number): void {
    if (this.comboTreatments.length > 1) this.comboTreatments.removeAt(index);
  }

  ngOnInit(): void {
    this.comboTreatments.valueChanges.subscribe(() => this.syncComboPrice());
    this.form.controls.treatment_category_id.valueChanges.subscribe(id => this.applyComboPriceLock(this.isComboCategory(id)));

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

  private isComboCategory(id: number | string | null | undefined): boolean {
    const name = this.categories().find(c => c.id === id)?.name ?? '';
    return name.trim().toLowerCase() === 'combo';
  }

  private syncComboPrice(): void {
    if (!this.isCombo()) return;
    const total = (this.comboTreatments.getRawValue() as { price: number }[])
      .reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    this.form.controls.price.setValue(total);
  }

  private applyComboPriceLock(isCombo: boolean): void {
    if (isCombo) {
      if (!this.comboTreatments.length) this.addComboTreatment();
      this.syncComboPrice();
      this.form.controls.price.disable({ emitEvent: false });
    } else {
      while (this.comboTreatments.length) this.comboTreatments.removeAt(0);
      this.form.controls.price.enable({ emitEvent: false });
    }
  }

  private patchTreatment(t: TreatmentRecord): void {
    this.form.patchValue({
      name: t.name,
      treatment_category_id: t.category?.id ?? null,
      branch_id: t.branch?.id ?? null,
      description: t.description ?? '',
      price: Number(t.amount),
      discount: Number(t.discount),
      discountType: t.discount_type,
      gstRate: Number(t.gst_rate),
      maxSessions: t.default_sittings,
      is_active: t.is_active,
    });

    while (this.comboTreatments.length) this.comboTreatments.removeAt(0);
    (t.combo_items ?? []).forEach(c => this.comboTreatments.push(this.createComboItem(c.name, Number(c.price))));
    if (this.isCombo() && !this.comboTreatments.length) this.addComboTreatment();

    while (this.materials.length) this.materials.removeAt(0);
    const rows = t.materials?.length ? t.materials : [{ product_id: null, name: '', unit: '', quantity: 1 }];
    // A product that is inactive (or since renamed) is missing from the dropdown - keep it selectable.
    const known = new Set(this.products().map(p => p.id));
    const missing = rows.filter(m => m.product_id && !known.has(m.product_id))
      .map(m => ({ id: m.product_id as number, name: m.name }));
    // Two rows can use the same missing product - list it once.
    const seen = new Set<number | string>();
    const uniqueMissing = missing.filter(m => !seen.has(m.id) && !!seen.add(m.id));
    if (uniqueMissing.length) this.products.set([...this.products(), ...uniqueMissing]);
    rows.forEach(m => this.materials.push(this.createMaterial(m.product_id, m.unit, Number(m.quantity))));
    this.materialCount.set(this.materials.length);
  }

  save(): void {
    if (this.readOnly || this.saving()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const isCombo = this.isCombo();

    const payload: TreatmentPayload = {
      treatment_category_id: Number(raw.treatment_category_id),
      branch_id: Number(raw.branch_id),
      name: (raw.name ?? '').trim(),
      description: (raw.description ?? '').trim(),
      amount: Number(raw.price) || 0,
      discount_type: raw.discountType!,
      discount: Number(raw.discount) || 0,
      gst_rate: Number(raw.gstRate),
      default_sittings: Number(raw.maxSessions),
      is_active: !!raw.is_active,
      materials: (raw.materials ?? []).map((m: any) => ({
        product_id: m.product_id,
        unit: (m.unit ?? '').trim(),
        quantity: Number(m.quantity),
      })),
      combo_items: !isCombo ? [] : (raw.comboTreatments ?? [])
        .filter((c: any) => (c.name ?? '').trim())
        .map((c: any) => ({ name: c.name.trim(), price: Number(c.price) || 0 })),
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
      price: 0,
      discount: 0,
      discountType: 'percentage',
      gstRate: 18,
      maxSessions: 1,
      is_active: true,
    });
    while (this.comboTreatments.length) this.comboTreatments.removeAt(0);
    while (this.materials.length) this.materials.removeAt(0);
    this.materials.push(this.createMaterial());
    this.materialCount.set(1);
  }
}
