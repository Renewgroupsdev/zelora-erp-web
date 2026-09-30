import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Sort, SortDirection } from '@angular/material/sort';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import {
  CommonFilterState,
  FilterOption,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '../../../shared/models/common-components.model';
import { InventoryService, ProductRecord } from '../../../shared/common-services/inventory.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { AddProductForm } from './add-product-form/add-product-form';

/** Table column key -> products API `sort_by` value. */
const SORT_FIELDS: Record<string, string> = {
  code: 'code',
  name: 'name',
  purchase: 'purchase_price',
  margin: 'margin_percent',
  selling: 'selling_price',
  gst: 'gst_amount',
  total: 'total_amount',
  status: 'status',
};

@Component({
  selector: 'app-product-management',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonFilterCard, CommonTableCard],
  templateUrl: './product-management.html',
  styleUrl: './product-management.scss',
})
export class ProductManagement implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly inventory = inject(InventoryService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<string>();

  private vendors: { id: number; name: string }[] = [];
  private records: ProductRecord[] = [];

  // The filter card is keyed by fixed names; `source` is reused here for the Vendor filter.
  filters: FilterOption[] = [
    { key: 'source', label: 'Vendor', options: [] },
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
  ];

  filterState: CommonFilterState = {
    status: null,
    source: null,
    branch: [],
    telecaller: null,
    dateFrom: null,
    dateTo: null,
  };

  columns: TableColumn[] = [
    { key: 'code', header: 'Code', type: 'text', width: '8%' },
    { key: 'name', header: 'Product', type: 'text', width: '18%' },
    { key: 'vendor', header: 'Vendor', type: 'text', width: '15%', sortable: false },
    { key: 'purchase', header: 'Purchase Price', type: 'text', width: '10%' },
    { key: 'margin', header: 'Margin', type: 'text', width: '7%' },
    { key: 'selling', header: 'Selling Price', type: 'text', width: '10%' },
    { key: 'gst', header: 'GST', type: 'text', width: '8%' },
    { key: 'total', header: 'Total Amount', type: 'text', width: '10%' },
    { key: 'status', header: 'Status', type: 'badge', width: '7%' },
    { key: 'action', header: 'Action', type: 'rowActions', width: '7%', sortable: false },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];
  isLoading = false;
  rows: TableRow[] = [];
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'code';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(term => {
        this.searchTerm = term.trim();
        this.currentPage = 1;
        this.loadProducts();
      });

    this.inventory.vendorOptions().subscribe(vendors => {
      this.vendors = vendors;
      this.filters = this.filters.map(f => f.key === 'source' ? { ...f, options: vendors.map(v => v.name) } : f);
    });

    this.loadProducts();
  }

  loadProducts(): void {
    this.isLoading = true;
    const vendor = this.vendors.find(v => v.name === this.filterState.source);

    this.inventory.listProducts({
      page: this.currentPage,
      perPage: this.pageSize,
      search: this.searchTerm,
      sortBy: SORT_FIELDS[this.sortActive] ?? 'code',
      sortDirection: this.sortDirection || 'asc',
      status: this.filterState.status as 'Active' | 'Inactive' | null,
      vendorId: vendor?.id ?? null,
    }).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.records = res?.data ?? [];
        this.totalRecords = res?.pagination?.total ?? 0;
        this.rows = this.records.map(p => this.toRow(p));
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('Failed to load products. Please try again.');
        console.error('Failed to load products:', err);
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
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.loadProducts();
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) return 'Showing 0 products';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} products`;
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.loadProducts();
  }

  onSortChange(sort: Sort): void {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.loadProducts();
  }

  onEditProduct(row: TableRow): void {
    const product = this.records.find(p => p.id === row['id']);
    if (product) this.openAddPopup(product);
  }

  async onDeleteProduct(row: TableRow): Promise<void> {
    const confirmed = await this.toast.confirm('Delete this product?', `${row['name'] ?? 'This product'} will be removed from Inventory.`);
    if (!confirmed) return;

    this.inventory.deleteProduct(String(row['id'])).subscribe({
      next: (res: any) => {
        if (res?.success === false) {
          this.toast.error(res?.message || 'Failed to delete product. Please try again.');
          return;
        }
        this.toast.success('Product deleted successfully');
        if (this.records.length === 1 && this.currentPage > 1) this.currentPage--;
        this.loadProducts();
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Failed to delete product. Please try again.');
        console.error('Failed to delete product:', err);
      },
    });
  }

  openAddPopup(product: ProductRecord | null = null): void {
    const dialogRef = this.dialog.open(AddProductForm, {
      width: '620px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      data: { product, vendors: this.vendors },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) this.loadProducts();
    });
  }

  private toRow(p: ProductRecord): TableRow {
    const inr = (v: number | string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      vendor: p.vendor?.name ?? '-',
      purchase: inr(p.purchase_price),
      margin: `${Number(p.margin_percent)}%`,
      selling: inr(p.selling_price),
      gst: `${inr(p.gst_amount)} (${Number(p.gst_percent)}%)`,
      total: inr(p.total_amount),
      status: p.status,
    };
  }
}
