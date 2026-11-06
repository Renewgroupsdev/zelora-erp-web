import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BranchOptionsService } from '../../../../../shared/common-services/branch-options.service';
import { PurchaseService } from '../../../../../shared/common-services/purchase.service';
import { Priority, PurchaseOption, lineTotals } from '../../../../../shared/models/purchase.model';

@Component({
  selector: 'app-purchase-request-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './purchase-request-form.html',
  styleUrl: '../../../../../shared/styles/erp-dialog.scss',
})
export class PurchaseRequestForm {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<PurchaseRequestForm>);
  readonly purchase = inject(PurchaseService);
  private readonly branchOptions = inject(BranchOptionsService);
  /** Requesting branch options (GET /branches/options). */
  readonly branches = this.branchOptions.options;

  /** Every active product, with the stock the chosen requesting branch has (a product already picked in another row is greyed out). */
  readonly products = signal<PurchaseOption[]>([]);
  readonly productsLoading = signal(false);
  readonly threshold = computed(() => this.purchase.meta().lowStockThreshold);
  readonly submitted = signal(false);
  readonly saving = signal(false);
  /** Local dates (the UTC date of toISOString is a day behind early in the morning in India). */
  readonly today = this.fmtIso(new Date());
  /** The PO date can be today or any day up to this many days ahead. */
  readonly maxDays = 30;
  readonly maxDate = this.fmtIso(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + this.maxDays));

  readonly form = this.fb.group({
    branchKey: [null as string | null, Validators.required],
    /** PO date typed as dd-mm-yyyy (or picked from the calendar): the date the branch wants the purchase order raised for. */
    requiredBy: ['', [Validators.required, (c: AbstractControl) => this.poDateError(c.value) ? { poDate: true } : null]],
    priority: [null as Priority | null, Validators.required],
    remarks: ['', Validators.maxLength(255)],
    items: this.fb.array([this.newItem()]),
  });

  private readonly branchKey = toSignal(this.form.controls.branchKey.valueChanges, { initialValue: this.form.controls.branchKey.value });

  /** The product list follows the requesting branch: a branch only asks for what it is running low on. */
  private async loadProducts(key: string | null): Promise<void> {
    if (!key) return void this.products.set([]);
    this.productsLoading.set(true);
    try {
      const list = await firstValueFrom(this.purchase.productOptions(null, key, true));
      if (key !== this.form.controls.branchKey.value) return; // the branch changed while loading
      this.products.set(list);
      // a product that no longer exists in the list is cleared
      for (const row of this.items.controls) {
        const id = row.get('productId')?.value;
        if (id && !list.some(p => p.id === id)) row.get('productId')?.setValue(null);
      }
    } catch {
      this.products.set([]);
    } finally {
      this.productsLoading.set(false);
    }
  }

  constructor() {
    effect(() => {
      const key = this.branchKey();
      untracked(() => { void this.loadProducts(key); });
    });
    this.branchOptions.ensure();
    // Default to the user's own branch (else the first branch) once the branch list has loaded.
    effect(() => {
      const branches = this.branches();
      const control = this.form.controls.branchKey;
      if (control.value !== null || !branches.length) return;
      const mine = branches.find(b => b.key === this.purchase.meta().userStoreKey);
      control.setValue((mine ?? branches[0]).key);
    });
  }

  readonly priorities: Priority[] = ['Low', 'Normal', 'High', 'Urgent'];

  /** Keep only digits and place the dashes as the user types: 05112026 -> 05-11-2026 (day, month, 4-digit year). */
  onPoDateInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const d = input.value.replace(/\D/g, '').slice(0, 8);
    const text = d.length > 4 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
    input.value = text;
    this.form.controls.requiredBy.setValue(text);
  }

  // ---- PO date calendar (opens under the box from the calendar icon; the typed dd-mm-yyyy format is unchanged)
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly calOpen = signal(false);
  /** First day of the month on show. */
  readonly calMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  readonly calTitle = computed(() => this.calMonth().toLocaleString('en-US', { month: 'long', year: 'numeric' }));
  /** The month's 6 weeks (42 days), the previous / next month's days greyed out. */
  readonly calDays = computed(() => {
    const first = this.calMonth();
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    const selected = this.isoOf(this.form.controls.requiredBy.value);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = this.fmtIso(d);
      return { iso, day: d.getDate(), other: d.getMonth() !== first.getMonth(), blocked: iso < this.today || iso > this.maxDate, today: iso === this.today, selected: iso === selected };
    });
  });
  /** No going before the current month or past the last allowed month: those days cannot be chosen anyway. */
  readonly calCanPrev = computed(() => this.fmtIso(this.calMonth()).slice(0, 7) > this.today.slice(0, 7));
  readonly calCanNext = computed(() => this.fmtIso(this.calMonth()).slice(0, 7) < this.maxDate.slice(0, 7));

  toggleCal(): void {
    if (!this.calOpen()) {
      // open on the month of the typed date (when valid), else this month
      const iso = this.isoOf(this.form.controls.requiredBy.value);
      const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
      this.calMonth.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    this.calOpen.update(o => !o);
  }

  shiftMonth(by: number): void {
    const m = this.calMonth();
    this.calMonth.set(new Date(m.getFullYear(), m.getMonth() + by, 1));
  }

  pickDay(cell: { iso: string; blocked: boolean }): void {
    if (cell.blocked) return;
    const [y, m, d] = cell.iso.split('-');
    this.form.controls.requiredBy.setValue(`${d}-${m}-${y}`);
    this.form.controls.requiredBy.markAsTouched();
    this.calOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.calOpen() && !(event.target as HTMLElement).closest('.po-cal-wrap')) this.calOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.calOpen.set(false);
  }

  private fmtIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** dd-mm-yyyy (valid) -> yyyy-mm-dd, else ''. */
  private isoOf(text: string | null): string {
    return /^\d{2}-\d{2}-\d{4}$/.test(text ?? '') && !this.poDateError(text) ? this.toIso(String(text)) : '';
  }

  /** null when the dd-mm-yyyy text is a real date that is not in the past. */
  poDateError(value: string | null): string | null {
    const v = (value ?? '').trim();
    if (!v) return 'Enter the PO date.';
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
    if (!m) return 'Use the format dd-mm-yyyy.';
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return 'Enter a valid date.';
    const iso = this.toIso(v);
    if (iso < this.today) return 'PO date cannot be in the past.';
    if (iso > this.maxDate) return `PO date can be at most ${this.maxDays} days from today (up to ${this.maxDate.split('-').reverse().join('-')}).`;
    return null;
  }

  private toIso(text: string): string {
    const [d, m, y] = text.split('-');
    return `${y}-${m}-${d}`;
  }

  get items(): FormArray {
    return this.form.controls.items;
  }

  private newItem() {
    return this.fb.group({
      productId: [null as string | null, Validators.required],
      qty: [1, [Validators.required, Validators.min(1)]],
    });
  }

  product(index: number): PurchaseOption | undefined {
    const id = this.items.at(index).get('productId')?.value;
    return this.products().find(p => p.id === id);
  }

  lineAmount(index: number): number {
    const p = this.product(index);
    const qty = Number(this.items.at(index).get('qty')?.value) || 0;
    return p ? p.unitPrice * qty * (1 + p.gstPercent / 100) : 0;
  }

  totals() {
    return lineTotals(this.items.controls.map((_, i) => ({
      unitPrice: this.product(i)?.unitPrice ?? 0,
      gstPercent: this.product(i)?.gstPercent ?? 0,
      requestedQty: Number(this.items.at(i).get('qty')?.value) || 0,
    })));
  }

  addItem(): void {
    this.items.push(this.newItem());
  }

  removeItem(index: number): void {
    if (this.items.length > 1) this.items.removeAt(index);
  }

  isTaken(productId: string, index: number): boolean {
    return this.items.controls.some((c, i) => i !== index && c.value.productId === productId);
  }

  invalid(path: string): boolean {
    const c = this.form.get(path);
    return !!c && c.invalid && (c.touched || this.submitted());
  }

  async submit(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) return;

    const raw = this.form.getRawValue();
    this.saving.set(true);
    const request = await this.purchase.createRequest({
      branchKey: String(raw.branchKey),
      requiredBy: this.toIso(String(raw.requiredBy)),
      priority: raw.priority as Priority,
      remarks: (raw.remarks ?? '').trim(),
      // Price + GST are taken from the product master on the server.
      items: raw.items.map((row: { productId: string | null; qty: number | null }) => ({ productId: String(row.productId), qty: Number(row.qty) })),
    });
    this.saving.set(false);
    if (request) this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close();
  }
}
