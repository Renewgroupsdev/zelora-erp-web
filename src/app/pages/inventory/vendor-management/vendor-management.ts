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
import { InventoryService, VendorRecord } from '../../../shared/common-services/inventory.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { AddVendorForm } from './add-vendor-form/add-vendor-form';

/** Table column key -> vendors API `sort_by` value. */
const SORT_FIELDS: Record<string, string> = {
  code: 'code',
  name: 'name',
  gstNo: 'gst_no',
  status: 'status',
};

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<string>();

  private records: VendorRecord[] = [];

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
    { key: 'phone', header: 'Phone', type: 'text', width: '10%', sortable: false },
    { key: 'email', header: 'Email', type: 'text', width: '22%', sortable: false },
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
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(term => {
        this.searchTerm = term.trim();
        this.currentPage = 1;
        this.loadVendors();
      });

    this.loadVendors();
  }

  loadVendors(): void {
    this.isLoading = true;

    this.inventory.listVendors({
      page: this.currentPage,
      perPage: this.pageSize,
      search: this.searchTerm,
      sortBy: SORT_FIELDS[this.sortActive] ?? 'code',
      sortDirection: this.sortDirection || 'asc',
      status: this.filterState.status as 'Active' | 'Inactive' | null,
    }).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        this.records = res?.data ?? [];
        this.totalRecords = res?.pagination?.total ?? 0;
        this.rows = this.records.map(v => this.toRow(v));
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('Failed to load vendors. Please try again.');
        console.error('Failed to load vendors:', err);
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
    this.loadVendors();
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
    this.loadVendors();
  }

  onSortChange(sort: Sort): void {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.loadVendors();
  }

  onEditVendor(row: TableRow): void {
    const vendor = this.records.find(v => v.id === row['id']);
    if (vendor) this.openAddPopup(vendor);
  }

  async onDeleteVendor(row: TableRow): Promise<void> {
    const confirmed = await this.toast.confirm('Delete this vendor?', `${row['name'] ?? 'This vendor'} will be removed from Vendor Management.`);
    if (!confirmed) return;

    this.inventory.deleteVendor(Number(row['id'])).subscribe({
      next: (res: any) => {
        if (res?.success === false) {
          this.toast.error(res?.message || 'Failed to delete vendor. Please try again.');
          return;
        }
        this.toast.success('Vendor deleted successfully');
        if (this.records.length === 1 && this.currentPage > 1) this.currentPage--;
        this.loadVendors();
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Failed to delete vendor. Please try again.');
        console.error('Failed to delete vendor:', err);
      },
    });
  }

  openAddPopup(vendor: VendorRecord | null = null): void {
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
      if (result) this.loadVendors();
    });
  }

  private toRow(v: VendorRecord): TableRow {
    return {
      id: v.id,
      code: v.code,
      name: v.name,
      phone: v.phone || '-',
      email: v.email || '-',
      gstNo: v.gst_no || '-',
      status: v.status,
    };
  }
}
