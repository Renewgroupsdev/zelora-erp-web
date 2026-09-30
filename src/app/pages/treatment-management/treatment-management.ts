import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Sort, SortDirection } from '@angular/material/sort';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
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
import { LookupOption, TreatmentManagementService, TreatmentRecord } from '../../shared/common-services/treatment-management.service';
import { ToastService } from '../../shared/common-services/toast.service';

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'view', icon: 'bi-eye', label: 'View', variant: 'default' },
  { key: 'edit', icon: 'bi-pencil-square', label: 'Edit', variant: 'default' },
  { key: 'delete', icon: 'bi-trash3', label: 'Delete', variant: 'danger' },
];

/** Table column key -> treatments API `sort_by` value. */
const SORT_FIELDS: Record<string, string> = {
  treatment: 'name',
  pricing: 'total_amount',
  sessions: 'default_sittings',
  status: 'is_active',
};

@Component({
  selector: 'app-treatment-management',
  standalone: true,
  imports: [CommonModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './treatment-management.html',
  styleUrl: './treatment-management.scss',
})
export class TreatmentManagement implements OnInit {
  private readonly service = inject(TreatmentManagementService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<string>();

  private categories: LookupOption[] = [];

  filters: FilterOption[] = [
    { key: 'type', label: 'Category', options: [] },
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
  ];

  readonly search = signal('');
  readonly filterState = signal<CommonFilterState>({
    status: null,
    source: null,
    branch: [],
    telecaller: null,
    dateFrom: null,
    dateTo: null,
    type: null,
  });
  readonly loading = signal(false);
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [10, 30, 50, 100];
  readonly sortActive = signal('treatment');
  readonly sortDirection = signal<SortDirection>('asc');

  readonly records = signal<TreatmentRecord[]>([]);
  readonly totalRecords = signal(0);
  readonly summary = signal({ total: 0, active: 0, inactive: 0 });

  readonly columns: TableColumn[] = [
    { key: 'treatment', header: 'Treatment', type: 'lead' },
    { key: 'category', header: 'Category', type: 'text', sortable: false },
    { key: 'branch', header: 'Branch', type: 'text', sortable: false },
    { key: 'pricing', header: 'Price (incl. GST)', type: 'text' },
    { key: 'sessions', header: 'Sittings', type: 'text' },
    { key: 'status', header: 'Status', type: 'badge' },
    { key: 'actions', header: 'Actions', type: 'quickActions', sortable: false },
  ];

  readonly stats = computed<DetailCardData[]>(() => [
    { label: 'Total treatments', value: this.summary().total, icon: 'bi-grid-3x3-gap', iconVariant: 'primary' },
    { label: 'Active', value: this.summary().active, icon: 'bi-check-circle', iconVariant: 'green' },
    { label: 'Inactive', value: this.summary().inactive, icon: 'bi-slash-circle', iconVariant: 'orange' },
  ]);

  readonly rows = computed<TableRow[]>(() => this.records().map(item => this.toRow(item)));

  readonly recordCountText = computed(() => `${this.totalRecords()} treatment${this.totalRecords() === 1 ? '' : 's'}`);

  readonly pageInfoText = computed(() => {
    const total = this.totalRecords();
    if (!total) return 'No treatments found';
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), total);
    return `Showing ${start}-${end} of ${total}`;
  });

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(term => {
        this.search.set(term.trim());
        this.currentPage.set(1);
        this.load();
      });

    this.service.categories().subscribe(categories => {
      this.categories = categories;
      this.filters = this.filters.map(f => f.key === 'type' ? { ...f, options: categories.map(c => c.name) } : f);
    });

    this.load();
  }

  load(): void {
    this.loading.set(true);
    const filters = this.filterState();
    const category = this.categories.find(c => c.name === filters.type);

    this.service.list({
      page: this.currentPage(),
      perPage: this.pageSize(),
      search: this.search(),
      sortBy: SORT_FIELDS[this.sortActive()] ?? 'name',
      sortDirection: this.sortDirection() || 'asc',
      categoryId: category ? Number(category.id) : null,
      isActive: filters.status ? filters.status === 'Active' : null,
    }).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        this.records.set(res?.data ?? []);
        this.totalRecords.set(res?.pagination?.total ?? 0);
        if (res?.summary) this.summary.set(res.summary);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.toast.error('Failed to load treatments', err?.error?.message || 'Please try again.');
        console.error('Failed to load treatments:', err);
      },
    });
  }

  onSearch(term: string): void {
    this.search$.next(term);
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState.set({ ...filters, branch: [...filters.branch] });
    this.currentPage.set(1);
    this.load();
  }

  onExport(): void {
    // Trigger export as needed.
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage.set(event.page);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  onSortChange(sort: Sort): void {
    this.sortActive.set(sort.active);
    this.sortDirection.set(sort.direction || 'asc');
    this.currentPage.set(1);
    this.load();
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    const id = event.row['id'] as string;
    if (event.action === 'view') this.view(id);
    else if (event.action === 'edit') this.edit(id);
    else if (event.action === 'delete') this.delete(id);
  }

  create(): void { this.router.navigate(['/app/treatments/create']); }
  edit(id: string): void { this.router.navigate(['/app/treatments/create'], { queryParams: { id, mode: 'edit' } }); }
  view(id: string): void { this.router.navigate(['/app/treatments/create'], { queryParams: { id, mode: 'view' } }); }

  async delete(id: string): Promise<void> {
    const treatment = this.records().find(t => t.id === id);
    if (!treatment) return;

    const confirmed = await this.toast.confirm('Delete this treatment?', `"${treatment.name}" will be removed from Treatment Management.`);
    if (!confirmed) return;

    this.service.remove(id).subscribe({
      next: (res: any) => {
        if (!res?.success) {
          this.toast.error('Delete failed', res?.message || 'Please try again.');
          return;
        }
        this.toast.success('Treatment deleted', `${treatment.name} has been removed from Treatment Management.`);
        if (this.records().length === 1 && this.currentPage() > 1) this.currentPage.update(p => p - 1);
        this.load();
      },
      error: (err: any) => {
        this.toast.error('Delete failed', err?.error?.message || 'Please try again.');
        console.error('Failed to delete treatment:', err);
      },
    });
  }

  private toRow(item: TreatmentRecord): TableRow {
    return {
      id: item.id,
      treatment: { name: item.name, subtitle: item.description || 'No description added' } as LeadCell,
      category: item.category?.name ?? '-',
      branch: item.branch?.name ?? '-',
      pricing: `₹${this.formatCurrency(Number(item.total_amount))}`,
      sessions: `${item.default_sittings} ${item.default_sittings === 1 ? 'sitting' : 'sittings'}`,
      status: item.is_active ? 'Active' : 'Inactive',
      actions: QUICK_ACTIONS,
    };
  }

  private formatCurrency(value: number): string {
    return Math.round(value).toLocaleString('en-IN');
  }
}
