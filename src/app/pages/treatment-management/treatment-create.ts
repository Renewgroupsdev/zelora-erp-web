import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ComboTreatmentItem, TreatmentCategory, TreatmentMaterial, TREATMENT_CATEGORIES } from '../../shared/data/treatment-catalog';
import { TreatmentManagementService } from '../../shared/common-services/treatment-management.service';
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
  editingKey: string | null = null;
  readonly readOnly = this.route.snapshot.queryParamMap.get('mode') === 'view';
  readonly store = inject(TreatmentManagementService);
  readonly categories = TREATMENT_CATEGORIES;

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    category: ['Hair' as TreatmentCategory, Validators.required],
    description: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    discount: [0, [Validators.min(0)]],
    discountType: ['percentage' as 'percentage' | 'fixed', Validators.required],
    gstRate: [18, [Validators.required, Validators.min(0), Validators.max(100)]],
    maxSessions: [1, [Validators.required, Validators.min(1)]],
    comboTreatments: this.fb.array([]),
    materials: this.fb.array([
      this.createMaterial('Gloves', 'pair'),
    ]),
  });

  /**
   * `computed()` only re-runs when a *signal* it read last time changes. Reading
   * `form.controls.category.value` directly (a plain property) isn't a signal read,
   * so a computed built on it would freeze at whatever category was active on its
   * first evaluation — clicking a different category tab would never update it.
   * Bridging the control's valueChanges through toSignal keeps it properly reactive.
   */
  readonly activeCategory = toSignal(this.form.controls.category.valueChanges, {
    initialValue: this.form.controls.category.value,
  });

  readonly filteredTreatments = computed(() =>
    this.store.treatments().filter(t => t.category === this.activeCategory())
  );

  // Same computed()-freezing issue as activeCategory: these need to react to edits in the
  // price/discount/GST fields, so each control's live value is bridged through toSignal
  // rather than read as a plain FormControl.value (which establishes no signal dependency).
  private readonly priceValue = toSignal(this.form.controls.price.valueChanges, { initialValue: this.form.controls.price.value });
  private readonly discountValue = toSignal(this.form.controls.discount.valueChanges, { initialValue: this.form.controls.discount.value });
  private readonly discountTypeValue = toSignal(this.form.controls.discountType.valueChanges, { initialValue: this.form.controls.discountType.value });
  private readonly gstRateValue = toSignal(this.form.controls.gstRate.valueChanges, { initialValue: this.form.controls.gstRate.value });

  readonly subtotal = computed(() => {
    const price = Number(this.priceValue()) || 0;
    const discount = Number(this.discountValue()) || 0;
    return Math.max(0, price - (this.discountTypeValue() === 'percentage'
      ? price * Math.min(discount, 100) / 100
      : discount));
  });

  readonly gstAmount = computed(() => this.subtotal() * (Number(this.gstRateValue()) || 0) / 100);
  readonly total = computed(() => this.subtotal() + this.gstAmount());

  // Pre-discount total, shown struck-through above the final price whenever a discount applies.
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

  createMaterial(name = '', unit = 'piece') {
    return this.fb.group({
      name: [name, Validators.required],
      unit: [unit, Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
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
      { label: this.editingKey ? (this.readOnly ? 'View Treatment' : 'Edit Treatment') : 'Create Treatment' },
    ];
  }

  setCategory(category: TreatmentCategory): void {
    if (this.readOnly) return;
    this.form.controls.category.setValue(category);
  }

  invalid(control: AbstractControl | null | undefined): boolean {
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  addMaterial(): void {
    const last = this.materials.at(this.materials.length - 1) as FormGroup | undefined;
    if (last && last.invalid) {
      last.markAllAsTouched();
      this.toast.warning('Complete this item first', 'Fill in the item name, unit and quantity before adding another.');
      return;
    }
    this.materials.push(this.createMaterial());
  }

  removeMaterial(index: number): void {
    if (this.materials.length > 1) this.materials.removeAt(index);
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
    // Base price is derived from the combo line-items whenever the "Combo" category is active,
    // so keep it in sync with every pick/remove and lock the field while it applies.
    this.comboTreatments.valueChanges.subscribe(() => this.syncComboPrice());
    this.form.controls.category.valueChanges.subscribe(category => this.applyComboPriceLock(category === 'Combo'));

    const key = this.route.snapshot.queryParamMap.get('key');
    if (key) {
      const treatment = this.store.getTreatment(key);
      if (treatment) { this.editingKey = key; this.patchTreatment(treatment); }
    }

    this.applyComboPriceLock(this.form.controls.category.value === 'Combo');

    // View Treatment reuses this same form; disabling it after every control is in place
    // greys every field out instead of swapping in a separate read-only layout.
    if (this.readOnly) {
      this.form.disable({ emitEvent: false });
    }
  }

  private syncComboPrice(): void {
    if (this.form.controls.category.value !== 'Combo') return;
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

  private patchTreatment(treatment: any): void {
    this.form.patchValue({ name: treatment.name, category: treatment.category, description: treatment.description, price: treatment.price, discount: treatment.discount, discountType: treatment.discountType, gstRate: treatment.gstRate, maxSessions: treatment.maxSessions });

    while (this.comboTreatments.length) this.comboTreatments.removeAt(0);
    // Older records only stored keys into the shared treatment catalogue; resolve those to
    // name/price rows so they still show up when reopened for edit under the add-a-row form.
    const comboSource: { name: string; price: number }[] = treatment.comboItems?.length
      ? treatment.comboItems
      : (treatment.treatmentKeys || []).map((key: string) => {
          const referenced = this.store.getTreatment(key);
          return { name: referenced?.name ?? key, price: referenced?.price ?? 0 };
        });
    comboSource.forEach((c) => this.comboTreatments.push(this.createComboItem(c.name, c.price)));
    if (this.form.controls.category.value === 'Combo' && !this.comboTreatments.length) this.addComboTreatment();

    while (this.materials.length) this.materials.removeAt(0);
    const list = treatment.materials?.length ? treatment.materials : [{name: 'Gloves', unit: 'pair', quantity: 1}];
    list.forEach((m: any) => { const group = this.createMaterial(m.name, m.unit); group.patchValue({ quantity: m.quantity }); this.materials.push(group); });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // this.toast.error('Missing required details', 'Please fill in the treatment name, category, max sittings, pricing and all added rows before creating the treatment.');
      return;
    }

    const raw = this.form.getRawValue();
    const materials: TreatmentMaterial[] = (raw.materials ?? []).map((m: any, i: number) => ({
      key: `${this.slug(m.name)}-${i + 1}`,
      name: m.name,
      unit: m.unit,
      quantity: Number(m.quantity),
    }));

    const isCombo = raw.category === 'Combo';
    const comboItems: ComboTreatmentItem[] = !isCombo ? [] : (raw.comboTreatments ?? [])
      .filter((c: any) => (c.name ?? '').trim())
      .map((c: any, i: number) => ({
        key: `${this.slug(c.name)}-${i + 1}`,
        name: c.name,
        price: Number(c.price) || 0,
      }));

    const key = this.editingKey ?? `${this.slug(raw.name ?? '')}-${Date.now()}`;
    const treatment = {
      key,
      name: raw.name!,
      category: raw.category!,
      price: Number(raw.price),
      description: raw.description ?? '',
      discount: Number(raw.discount) || 0,
      discountType: raw.discountType!,
      gstRate: Number(raw.gstRate),
      maxSessions: Number(raw.maxSessions),
      isCombo,
      treatmentKeys: [] as string[],
      comboItems,
      materials,
    };
    if (this.editingKey) {
      this.store.updateTreatment(this.editingKey, treatment);
      this.toast.success('Treatment updated', `${treatment.name} has been updated successfully.`);
    } else {
      this.store.addTreatment(treatment);
      this.toast.success('Treatment created', `${treatment.name} has been added to Treatment Management.`);
    }
    this.router.navigate(['/app/treatments']);
  }

  reset(): void {
    this.form.reset({
      name: '',
      category: 'Hair',
      description: '',
      price: 0,
      discount: 0,
      discountType: 'percentage',
      gstRate: 18,
      maxSessions: 1,
    });
    while (this.comboTreatments.length) this.comboTreatments.removeAt(0);
    while (this.materials.length) this.materials.removeAt(0);
    this.materials.push(this.createMaterial('Gloves', 'pair'));
  }

  private slug(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'treatment';
  }
}
