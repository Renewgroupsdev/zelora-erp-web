import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Sort, SortDirection } from '@angular/material/sort';
import { CommonDetailCard } from '../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../shared/components/common-table-card/common-table-card';
import {
  CommonFilterState,
  DetailCardData,
  FilterOption,
  LeadCell,
  QuickAction,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '../../shared/models/common-components.model';
import { TreatmentCategory, TREATMENT_CATEGORIES } from '../../shared/data/treatment-catalog';
import { TreatmentDraft, TreatmentManagementService } from '../../shared/common-services/treatment-management.service';
import { ToastService } from '../../shared/common-services/toast.service';

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'view', icon: 'bi-eye', label: 'View', variant: 'default' },
  { key: 'edit', icon: 'bi-pencil-square', label: 'Edit', variant: 'default' },
  { key: 'delete', icon: 'bi-trash3', label: 'Delete', variant: 'danger' },
];

@Component({
  selector: 'app-treatment-management',
  standalone: true,
  imports: [CommonModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './treatment-management.html',
  styleUrl: './treatment-management.scss',
})
export class TreatmentManagement {
  readonly store = inject(TreatmentManagementService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  // The shared filter card only knows about a fixed CommonFilterState shape, so the
  // "status" slot doubles as Category and "source" as Type (Treatment/Combo) here.
  readonly filters: FilterOption[] = [
    { key: 'status', label: 'Category', options: [...TREATMENT_CATEGORIES] },
    { key: 'source', label: 'Type', options: ['Treatment', 'Combo'] },
  ];

  // Real signals (not plain fields) so the computed()s below actually re-run when these change.
  readonly search = signal('');
  readonly filterState = signal<CommonFilterState>({
    status: null,
    source: null,
    branch: [],
    telecaller: null,
    dateFrom: null,
    dateTo: null,
  });
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [10, 30, 50, 100];
  readonly sortActive = signal('treatment');
  readonly sortDirection = signal<SortDirection>('asc');

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
    { label: 'Hair', value: this.categoryCount('Hair'), icon: 'bi-droplet-half', iconVariant: 'green' },
    { label: 'Skin', value: this.categoryCount('Skin'), icon: 'bi-stars', iconVariant: 'blue' },
    { label: 'Slimming', value: this.categoryCount('Slimming'), icon: 'bi-person-walking', iconVariant: 'orange' },
    { label: 'Combo treatments', value: this.comboCount(), icon: 'bi-layers', iconVariant: 'purple' },
  ]);

  readonly filteredTreatments = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filters = this.filterState();
    const matched = this.store.treatments().filter(t => {
      if (query && !t.name.toLowerCase().includes(query) && !(t.description ?? '').toLowerCase().includes(query)) return false;
      if (filters.status && t.category !== filters.status) return false;
      if (filters.source && (t.isCombo ? 'Combo' : 'Treatment') !== filters.source) return false;
      return true;
    });
    return this.sortTreatments(matched);
  });

  readonly totalRecords = computed(() => this.filteredTreatments().length);

  readonly rows = computed<TableRow[]>(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredTreatments().slice(start, start + this.pageSize()).map(item => this.toRow(item));
  });

  readonly recordCountText = computed(() => `${this.totalRecords()} treatment${this.totalRecords() === 1 ? '' : 's'}`);

  readonly pageInfoText = computed(() => {
    const total = this.totalRecords();
    if (!total) return 'No treatments found';
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), total);
    return `Showing ${start}-${end} of ${total}`;
  });

  onSearch(term: string): void {
    this.search.set(term);
    this.currentPage.set(1);
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState.set({ ...filters, branch: [...filters.branch] });
    this.currentPage.set(1);
  }

  onExport(): void {
    // Trigger export as needed.
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage.set(event.page);
    this.pageSize.set(event.pageSize);
  }

  onSortChange(sort: Sort): void {
    this.sortActive.set(sort.active);
    this.sortDirection.set(sort.direction || 'asc');
    this.currentPage.set(1);
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
  async delete(key: string): Promise<void> {
    const treatment = this.store.getTreatment(key);
    if (!treatment) return;

    const confirmed = await this.toast.confirm('Delete this treatment?', `"${treatment.name}" will be permanently removed. This action cannot be undone.`);
    if (!confirmed) return;

    this.store.removeTreatment(key);
    this.toast.success('Treatment deleted', `${treatment.name} has been removed from Treatment Management.`);
  }

  finalPrice(t: TreatmentDraft): number {
    const discount = t.discountType === 'percentage' ? t.price * Math.min(t.discount || 0, 100) / 100 : (t.discount || 0);
    const taxable = Math.max(0, t.price - discount);
    return taxable + taxable * (t.gstRate || 0) / 100;
  }

  categoryCount(category: TreatmentCategory): number { return this.store.treatments().filter(t => t.category === category).length; }
  comboCount(): number { return this.store.treatments().filter(t => t.isCombo).length; }

  private sortTreatments(items: TreatmentDraft[]): TreatmentDraft[] {
    const active = this.sortActive();
    const direction = this.sortDirection();
    if (!active || !direction) return items;

    const factor = direction === 'asc' ? 1 : -1;
    return [...items].sort((left, right) => {
      const leftValue = this.getSortableValue(left, active);
      const rightValue = this.getSortableValue(right, active);
      if (leftValue < rightValue) return -1 * factor;
      if (leftValue > rightValue) return 1 * factor;
      return 0;
    });
  }

  private getSortableValue(item: TreatmentDraft, key: string): string | number {
    if (key === 'treatment') return item.name.toLowerCase();
    if (key === 'type') return item.isCombo ? 'combo' : 'treatment';
    if (key === 'pricing') return this.finalPrice(item);
    if (key === 'sessions') return item.maxSessions;
    if (key === 'materials') return item.materials.length;
    return item.name.toLowerCase();
  }

  private toRow(item: TreatmentDraft): TableRow {
    return {
      key: item.key,
      treatment: { name: item.name, subtitle: item.description || 'No description added' } as LeadCell,
      type: item.isCombo ? 'Combo' : 'Treatment',
      pricing: `₹${this.formatCurrency(this.finalPrice(item))}`,
      sessions: `${item.maxSessions} max sittings`,
      materials: `${item.materials.length} items`,
      actions: QUICK_ACTIONS,
    };
  }

  private formatCurrency(value: number): string {
    return Math.round(value).toLocaleString('en-IN');
  }
}
