import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { AddOrganizationForm } from './add-organization-form/add-organization-form';

@Component({
  selector: 'app-organization',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonFilterCard, CommonTableCard],
  templateUrl: './organization.html',
  styleUrl: './organization.scss',
})
export class Organization implements OnInit {

  constructor(
    private dialog: MatDialog,
    private apiDataService: ApiDataService,
    private toast: ToastService,
  ) { }

  filters: FilterOption[] = [
    { key: 'type', label: 'Type', options: ['Head Office', 'Branch', 'Division', 'Department', 'Warehouse'] },
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
  ];

  filterState: CommonFilterState = {
    status: null,
    source: null,
    branch: [],
    telecaller: null,
    dateFrom: null,
    dateTo: null,
    type: null,
  };

  columns: TableColumn[] = [
    { key: 'code', header: 'Code', type: 'text', width: '10%' },
    { key: 'name', header: 'Name', type: 'text', width: '22%' },
    { key: 'type', header: 'Type', type: 'text', width: '13%' },
    { key: 'phone_no', header: 'Phone', type: 'text', width: '13%' },
    { key: 'email', header: 'Email', type: 'text', width: '18%' },
    { key: 'status', header: 'Status', type: 'badge', width: '10%' },
    { key: 'action', header: 'Action', type: 'rowActions', width: '10%', sortable: false },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];
  isLoading = false;
  allRows: TableRow[] = [];
  /** Raw org unit records from the API, keyed by id, so a fresh Edit fetch has somewhere to
   *  fall back to if that request ever fails. */
  private unitsById = new Map<number, any>();

  rows: TableRow[] = [];
  loading = false;
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'name';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  ngOnInit(): void {
    this.loadOrganizations();
  }

  loadOrganizations(): void {
    this.isLoading = true;
    this.loading = true;

    this.apiDataService.GetAllPages(ApiRoutesConstants.ORGANIZATION_GET_List).subscribe({
      next: (units: any[]) => {
        this.isLoading = false;

        this.unitsById.clear();
        units.forEach((unit: any) => this.unitsById.set(unit.id, unit));

        this.allRows = units.map((unit: any) => this.mapUnitToRow(unit));
        this.currentPage = 1;
        this.refreshRows();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.loading = false;
        this.toast.error('Failed to load organization units. Please try again.');
        console.error('Failed to load organization units:', err);
      },
    });
  }

  private mapUnitToRow(unit: any): TableRow {
    return {
      id: unit.id,
      code: unit.code ?? '',
      name: unit.name ?? '',
      type: this.formatType(unit.type),
      phone_no: unit.phone_no ?? '-',
      email: unit.email ?? '-',
      status: this.formatStatus(unit.status),
    };
  }

  private formatType(type: unknown): string {
    if (!type) return '-';
    return String(type).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** status comes back as the raw 1/0 tinyint from Postgres. */
  private formatStatus(status: unknown): 'Active' | 'Inactive' {
    if (typeof status === 'string') {
      return status.trim().toLowerCase() === 'active' || status === '1' ? 'Active' : 'Inactive';
    }
    return Number(status) === 1 ? 'Active' : 'Inactive';
  }

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
    this.currentPage = 1;
    this.loading = true;
    this.refreshRows();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.loading = true;
    this.refreshRows();
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) {
      return 'Showing 0 organization units';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} organization units`;
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.loading = true;
    this.refreshRows();
  }

  onSortChange(sort: Sort): void {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.loading = true;
    this.refreshRows();
  }

  onEditOrganization(row: TableRow): void {
    const id = Number(row['id']);

    this.apiDataService.GET(`${ApiRoutesConstants.ORGANIZATION_ADD}/${id}`).subscribe({
      next: (response: any) => {
        const unit = response?.success ? response.data : this.unitsById.get(id);
        this.openAddPopup(unit ?? null);
      },
      error: (err: any) => {
        this.toast.error('Failed to load organization unit details. Please try again.');
        console.error('Failed to load organization unit details:', err);
      },
    });
  }

  async onDeleteOrganization(row: TableRow): Promise<void> {
    const confirmed = await this.toast.confirm(
      'Delete this organization unit?',
      `${row['name'] ?? 'This organization unit'} will be permanently removed.`
    );

    if (!confirmed) {
      return;
    }

    const path = `${ApiRoutesConstants.ORGANIZATION_DELETE}/${row['id']}`;
    this.apiDataService.Delete(path, {}).subscribe({
      next: (response: any) => {
        if (response && response.success !== false) {
          this.toast.success('Organization unit deleted successfully');
          this.loadOrganizations();
        } else {
          this.toast.error(response?.message || 'Failed to delete organization unit. Please try again.');
        }
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Failed to delete organization unit. Please try again.');
        console.error('Failed to delete organization unit:', err);
      },
    });
  }

  openAddPopup(data: any = null): void {
    const dialogRef = this.dialog.open(AddOrganizationForm, {
      width: '680px',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      data,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) return;
      this.loadOrganizations();
    });
  }

  private refreshRows(): void {
    const filteredRows = this.getFilteredRows();
    const sortedRows = this.getSortedRows(filteredRows);

    this.totalRecords = sortedRows.length;

    const totalPages = Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.rows = sortedRows.slice(startIndex, endIndex);
    this.loading = false;
  }

  private getFilteredRows(): TableRow[] {
    return this.allRows.filter((row) => {
      const haystack = [row['code'], row['name'], row['email'], row['phone_no']].join(' ').toLowerCase();

      if (this.searchTerm && !haystack.includes(this.searchTerm)) return false;
      if (this.filterState.type && row['type'] !== this.filterState.type) return false;
      if (this.filterState.status && row['status'] !== this.filterState.status) return false;

      return true;
    });
  }

  private getSortedRows(rows: TableRow[]): TableRow[] {
    if (!this.sortActive || !this.sortDirection) {
      return rows;
    }

    const direction = this.sortDirection === 'asc' ? 1 : -1;

    return [...rows].sort((left, right) => {
      const leftValue = String(left[this.sortActive] ?? '').toLowerCase();
      const rightValue = String(right[this.sortActive] ?? '').toLowerCase();

      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return 1 * direction;
      return 0;
    });
  }
}
