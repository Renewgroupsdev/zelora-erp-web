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
import { InventoryService, Vendor } from '../../../shared/common-services/inventory.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { AddVendorForm } from './add-vendor-form/add-vendor-form';

@Component({
  selector: 'app-vendor-management',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonFilterCard, CommonTableCard],
  templateUrl: './vendor-management.html',
  styleUrl: './vendor-management.scss',
})
export class VendorManagement implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly inventory = inject(InventoryService);
  private readonly toast = inject(ToastService);

  filters: FilterOption[] = [
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
    { key: 'name', header: 'Vendor Name', type: 'text', width: '22%' },
    { key: 'phone', header: 'Phone', type: 'text', width: '10%' },
    { key: 'email', header: 'Email', type: 'text', width: '22%' },
    { key: 'gstNo', header: 'GST No', type: 'text', width: '16%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'action', header: 'Action', type: 'rowActions', width: '8%', sortable: false },
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
    if (!this.totalRecords) return 'Showing 0 vendors';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} vendors`;
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

  onEditVendor(row: TableRow): void {
    const vendor = this.inventory.vendors().find(v => v.id === row['id']);
    if (vendor) this.openAddPopup(vendor);
  }

  async onDeleteVendor(row: TableRow): Promise<void> {
    const confirmed = await this.toast.confirm('Delete this vendor?', `${row['name'] ?? 'This vendor'} will be removed and its products left without a supplier.`);
    if (!confirmed) return;

    this.inventory.deleteVendor(String(row['id']));
    this.toast.success('Vendor deleted successfully');
    this.refreshRows();
  }

  openAddPopup(vendor: Vendor | null = null): void {
    const dialogRef = this.dialog.open(AddVendorForm, {
      width: '620px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      data: { vendor },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) this.refreshRows();
    });
  }

  private toRow(v: Vendor): TableRow {
    return {
      id: v.id,
      code: v.code,
      name: v.name,
      phone: v.phone || '-',
      email: v.email || '-',
      gstNo: v.gstNo || '-',
      status: v.status,
    };
  }

  private refreshRows(): void {
    const sorted = this.getSorted(this.getFiltered());
    this.totalRecords = sorted.length;

    const totalPages = Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const start = (this.currentPage - 1) * this.pageSize;
    this.rows = sorted.slice(start, start + this.pageSize).map(v => this.toRow(v));
  }

  private getFiltered(): Vendor[] {
    return this.inventory.vendors().filter(v => {
      const haystack = [v.code, v.name, v.phone, v.email, v.gstNo].join(' ').toLowerCase();
      if (this.searchTerm && !haystack.includes(this.searchTerm)) return false;
      if (this.filterState.status && v.status !== this.filterState.status) return false;
      return true;
    });
  }

  private getSorted(vendors: Vendor[]): Vendor[] {
    if (!this.sortActive || !this.sortDirection) return vendors;
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    const value = (v: Vendor): string => String(({
      name: v.name, phone: v.phone, email: v.email, gstNo: v.gstNo, status: v.status, code: v.code,
    } as Record<string, string>)[this.sortActive] ?? v.code).toLowerCase();
    return [...vendors].sort((a, b) => {
      const l = value(a), r = value(b);
      return l < r ? -1 * direction : l > r ? 1 * direction : 0;
    });
  }
}
