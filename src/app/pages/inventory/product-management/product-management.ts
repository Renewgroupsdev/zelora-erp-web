import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Sort, SortDirection } from '@angular/material/sort';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import {
  CommonFilterState,
  FilterOption,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '../../../shared/models/common-components.model';
import { InventoryService, Product } from '../../../shared/common-services/inventory.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { AddProductForm } from './add-product-form/add-product-form';

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
    { key: 'vendor', header: 'Vendor', type: 'text', width: '15%' },
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
    this.filters = this.filters.map(f =>
      f.key === 'source' ? { ...f, options: this.inventory.vendors().map(v => v.name) } : f);
    this.refreshRows();
  }

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;
    this.refreshRows();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.refreshRows();
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
    this.refreshRows();
  }

  onSortChange(sort: Sort): void {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.refreshRows();
  }

  onEditProduct(row: TableRow): void {
    const product = this.inventory.products().find(p => p.id === row['id']);
    if (product) this.openAddPopup(product);
  }

  async onDeleteProduct(row: TableRow): Promise<void> {
    const confirmed = await this.toast.confirm('Delete this product?', `${row['name'] ?? 'This product'} will be removed from Inventory.`);
    if (!confirmed) return;

    this.inventory.deleteProduct(String(row['id']));
    this.toast.success('Product deleted successfully');
    this.refreshRows();
  }

  openAddPopup(product: Product | null = null): void {
    const dialogRef = this.dialog.open(AddProductForm, {
      width: '620px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      data: { product },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) this.refreshRows();
    });
  }

  private toRow(p: Product): TableRow {
    const inr = (v: number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      vendor: this.inventory.vendorName(p.vendorId),
      purchase: inr(p.purchasePrice),
      margin: `${p.marginPercent}%`,
      selling: inr(p.sellingPrice),
      gst: `${inr(p.gstAmount)} (${p.gstPercent}%)`,
      total: inr(p.totalAmount),
      status: p.status,
    };
  }

  private refreshRows(): void {
    const sorted = this.getSorted(this.getFiltered());
    this.totalRecords = sorted.length;

    const totalPages = Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const start = (this.currentPage - 1) * this.pageSize;
    this.rows = sorted.slice(start, start + this.pageSize).map(p => this.toRow(p));
  }

  private getFiltered(): Product[] {
    return this.inventory.products().filter(p => {
      const vendor = this.inventory.vendorName(p.vendorId);
      const haystack = [p.code, p.name, vendor].join(' ').toLowerCase();
      if (this.searchTerm && !haystack.includes(this.searchTerm)) return false;
      if (this.filterState.source && vendor !== this.filterState.source) return false;
      if (this.filterState.status && p.status !== this.filterState.status) return false;
      return true;
    });
  }

  private getSorted(products: Product[]): Product[] {
    if (!this.sortActive || !this.sortDirection) return products;
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    const value = (p: Product): string | number => {
      switch (this.sortActive) {
        case 'vendor': return this.inventory.vendorName(p.vendorId).toLowerCase();
        case 'purchase': return p.purchasePrice;
        case 'margin': return p.marginPercent;
        case 'selling': return p.sellingPrice;
        case 'gst': return p.gstAmount;
        case 'total': return p.totalAmount;
        case 'status': return p.status;
        case 'name': return p.name.toLowerCase();
        default: return p.code;
      }
    };
    return [...products].sort((a, b) => {
      const l = value(a), r = value(b);
      return l < r ? -1 * direction : l > r ? 1 * direction : 0;
    });
  }
}
