import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonTableCard } from '../../shared/components/common-table-card/common-table-card';
import { DetailCardData, LeadCell, QuickAction, TableColumn, TablePageChangeEvent, TableRow } from '../../shared/models/common-components.model';
import { TreatmentCategory, TREATMENT_CATEGORIES } from '../../shared/data/treatment-catalog';
import { TreatmentDraft, TreatmentManagementService } from '../../shared/common-services/treatment-management.service';

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'view', icon: 'bi-eye', label: 'View', variant: 'default' },
  { key: 'edit', icon: 'bi-pencil-square', label: 'Edit', variant: 'default' },
  { key: 'delete', icon: 'bi-trash3', label: 'Delete', variant: 'danger' },
];

@Component({
  selector: 'app-treatment-management',
  standalone: true,
  imports: [CommonModule, FormsModule, CommonDetailCard, CommonTableCard],
  templateUrl: './treatment-management.html',
  styleUrl: './treatment-management.scss',
})
export class TreatmentManagement {
  readonly store = inject(TreatmentManagementService);
  private readonly router = inject(Router);
  readonly categories = TREATMENT_CATEGORIES;

  // Real signals (not plain fields) so the computed()s below actually re-run when these change.
  readonly category = signal<TreatmentCategory>('Hair');
  readonly search = signal('');
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [10, 30, 50, 100];

  readonly columns: TableColumn[] = [
    { key: 'treatment', header: 'Treatment', type: 'lead' },
    { key: 'type', header: 'Type', type: 'text' },
    { key: 'pricing', header: 'Pricing', type: 'text' },
    { key: 'sessions', header: 'Sessions', type: 'text' },
    { key: 'materials', header: 'Materials', type: 'text' },
    { key: 'actions', header: 'Actions', type: 'quickActions' },
  ];

  readonly stats = computed<DetailCardData[]>(() => [
    { label: 'Total treatments', value: this.store.treatments().length, icon: 'bi-grid-3x3-gap', iconVariant: 'primary' },
    { label: 'Hair', value: this.categoryCount('Hair'), icon: 'bi-scissors', iconVariant: 'green' },
    { label: 'Skin', value: this.categoryCount('Skin'), icon: 'bi-stars', iconVariant: 'blue' },
    { label: 'Combo treatments', value: this.comboCount(), icon: 'bi-layers', iconVariant: 'purple' },
  ]);

  readonly filteredTreatments = computed(() => {
    const query = this.search().trim().toLowerCase();
    const category = this.category();
    return this.store.treatments().filter(t => t.category === category && (!query || t.name.toLowerCase().includes(query)));
  });

  readonly totalRecords = computed(() => this.filteredTreatments().length);

  readonly rows = computed<TableRow[]>(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredTreatments().slice(start, start + this.pageSize()).map(item => this.toRow(item));
  });

  readonly recordCountText = computed(() => `${this.totalRecords()} treatment${this.totalRecords() === 1 ? '' : 's'}`);

  readonly pageInfoText = computed(() => {
    const total = this.totalRecords();
    if (!total) return `No ${this.category()} treatments found`;
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), total);
    return `Showing ${start}-${end} of ${total}`;
  });

  setCategory(category: TreatmentCategory): void {
    this.category.set(category);
    this.currentPage.set(1);
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    this.currentPage.set(1);
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage.set(event.page);
    this.pageSize.set(event.pageSize);
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    const key = event.row['key'] as string;
    if (event.action === 'view') this.view(key);
    else if (event.action === 'edit') this.edit(key);
    else if (event.action === 'delete') this.delete(key);
  }

  create(): void { this.router.navigate(['/app/treatments/create']); }
  edit(key: string): void { this.router.navigate(['/app/treatments/create'], { queryParams: { key, mode: 'edit' } }); }
  view(key: string): void { this.router.navigate(['/app/treatments/create'], { queryParams: { key, mode: 'view' } }); }
  delete(key: string): void {
    const treatment = this.store.getTreatment(key);
    if (!treatment) return;
    if (confirm(`Delete "${treatment.name}"? This action cannot be undone.`)) this.store.removeTreatment(key);
  }

  finalPrice(t: TreatmentDraft): number {
    const discount = t.discountType === 'percentage' ? t.price * Math.min(t.discount || 0, 100) / 100 : (t.discount || 0);
    const taxable = Math.max(0, t.price - discount);
    return taxable + taxable * (t.gstRate || 0) / 100;
  }

  categoryCount(category: TreatmentCategory): number { return this.store.treatments().filter(t => t.category === category).length; }
  comboCount(): number { return this.store.treatments().filter(t => t.isCombo).length; }

  private toRow(item: TreatmentDraft): TableRow {
    return {
      key: item.key,
      treatment: { name: item.name, subtitle: item.description || 'No description added' } as LeadCell,
      type: item.isCombo ? 'Combo' : 'Treatment',
      pricing: `₹${this.formatCurrency(this.finalPrice(item))} · Base ₹${this.formatCurrency(item.price)} · GST ${item.gstRate}%`,
      sessions: `${item.maxSessions} max sittings`,
      materials: `${item.materials.length} items / sitting`,
      actions: QUICK_ACTIONS,
    };
  }

  private formatCurrency(value: number): string {
    return Math.round(value).toLocaleString('en-IN');
  }
}
