import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TreatmentCategory, TreatmentMaterial, TREATMENT_CATEGORIES } from '../../shared/data/treatment-catalog';
import { TreatmentManagementService } from '../../shared/common-services/treatment-management.service';

@Component({
  selector: 'app-treatment-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './treatment-create.html',
  styleUrl: './treatment-create.scss',
})
export class TreatmentCreate implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
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
    isCombo: [false],
    treatmentKeys: this.fb.array<string>([]),
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

  get materials(): FormArray { return this.form.controls.materials; }
  get treatmentKeys(): FormArray { return this.form.controls.treatmentKeys; }

  createMaterial(name = '', unit = 'piece') {
    return this.fb.group({
      name: [name, Validators.required],
      unit: [unit, Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
    });
  }

  setCategory(category: TreatmentCategory): void {
    if (this.readOnly) return;
    this.form.controls.category.setValue(category);
  }

  addMaterial(): void {
    this.materials.push(this.createMaterial());
  }

  removeMaterial(index: number): void {
    if (this.materials.length > 1) this.materials.removeAt(index);
  }

  toggleTreatment(key: string): void {
    if (this.readOnly) return;
    const index = this.treatmentKeys.controls.findIndex(control => control.value === key);
    if (index >= 0) {
      this.treatmentKeys.removeAt(index);
    } else {
      this.treatmentKeys.push(this.fb.control(key));
    }
  }

  isSelected(key: string): boolean {
    return this.treatmentKeys.controls.some(control => control.value === key);
  }

  ngOnInit(): void {
    const key = this.route.snapshot.queryParamMap.get('key');
    if (key) {
      const treatment = this.store.getTreatment(key);
      if (treatment) { this.editingKey = key; this.patchTreatment(treatment); }
    }
  }

  private patchTreatment(treatment: any): void {
    this.form.patchValue({ name: treatment.name, category: treatment.category, description: treatment.description, price: treatment.price, discount: treatment.discount, discountType: treatment.discountType, gstRate: treatment.gstRate, maxSessions: treatment.maxSessions, isCombo: treatment.isCombo });
    while (this.treatmentKeys.length) this.treatmentKeys.removeAt(0);
    (treatment.treatmentKeys || []).forEach((key: string) => this.treatmentKeys.push(this.fb.control(key)));
    while (this.materials.length) this.materials.removeAt(0);
    const list = treatment.materials?.length ? treatment.materials : [{name: 'Gloves', unit: 'pair', quantity: 1}];
    list.forEach((m: any) => { const group = this.createMaterial(m.name, m.unit); group.patchValue({ quantity: m.quantity }); this.materials.push(group); });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const materials: TreatmentMaterial[] = (raw.materials ?? []).map((m: any, i: number) => ({
      key: `${this.slug(m.name)}-${i + 1}`,
      name: m.name,
      unit: m.unit,
      quantity: Number(m.quantity),
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
      isCombo: !!raw.isCombo,
      treatmentKeys: (raw.treatmentKeys ?? []) as string[],
      materials,
    };
    if (this.editingKey) this.store.updateTreatment(this.editingKey, treatment);
    else this.store.addTreatment(treatment);
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
      isCombo: false,
    });
    while (this.treatmentKeys.length) this.treatmentKeys.removeAt(0);
    while (this.materials.length) this.materials.removeAt(0);
    this.materials.push(this.createMaterial('Gloves', 'pair'));
  }

  private slug(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'treatment';
  }
}
