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
import { AddLeadStatusForm } from './add-lead-status-form/add-lead-status-form';

@Component({
  selector: 'app-lead-status',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonFilterCard, CommonTableCard],
  templateUrl: './lead-status.html',
  styleUrl: './lead-status.scss',
})
export class LeadStatus implements OnInit {

  constructor(
    private dialog: MatDialog,
    private apiDataService: ApiDataService,
    private toast: ToastService,
  ) { }

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
    { key: 'name', header: 'Status Name', type: 'text', width: '40%' },
    { key: 'status', header: 'Status', type: 'badge', width: '25%' },
    { key: 'created_at', header: 'Created Date', type: 'text', width: '20%' },
    { key: 'action', header: 'Action', type: 'rowActions', width: '15%', sortable: false },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];
  isLoading = false;
  allRows: TableRow[] = [];
  /** Raw lead-status records from the API, keyed by id, so a fresh Edit fetch has somewhere to
   *  fall back to if that request ever fails. */
  private statusesById = new Map<number, any>();

  rows: TableRow[] = [];
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = 'name';
  sortDirection: SortDirection = 'asc';
  private searchTerm = '';

  ngOnInit(): void {
    this.loadStatuses();
  }

  loadStatuses(): void {
    this.isLoading = true;

    // GetAllPages walks every page of the (paginated) endpoint so the list is always complete,
    // regardless of how many statuses exist relative to the API's page size.
    this.apiDataService.GetAllPages(ApiRoutesConstants.LEAD_STATUS_GET_List).subscribe({
      next: (statuses: any[]) => {
        this.isLoading = false;

        this.statusesById.clear();
        statuses.forEach((status: any) => this.statusesById.set(status.id, status));

        this.allRows = statuses.map((status: any) => this.mapStatusToRow(status));
        this.currentPage = 1;
        this.refreshRows();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('Failed to load lead statuses. Please try again.');
        console.error('Failed to load lead statuses:', err);
      },
    });
  }

  private mapStatusToRow(status: any): TableRow {
    return {
      name: status.name ?? '',
      status: this.formatStatus(status.status),
      created_at: this.formatDate(status.created_at),
      id: status.id,
    };
  }

  /** status can come back as "active"/"inactive" (list reads), "1"/"0" (edit reads), or 1/0
   *  (what we send on write) - normalize all of them into the Active/Inactive label the badge
   *  and filter use. */
  private formatStatus(status: unknown): 'Active' | 'Inactive' {
    if (typeof status === 'string') {
      const value = status.trim().toLowerCase();
      if (value === 'active' || value === '1') return 'Active';
      if (value === 'inactive' || value === '0') return 'Inactive';
    }
    return Number(status) === 1 ? 'Active' : 'Inactive';
  }

  /** ISO timestamp from the API -> "DD-Mon-YYYY" to match the rest of the UI. */
  private formatDate(value: unknown): string {
    if (!value) return '';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
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
    if (!this.totalRecords) {
      return 'Showing 0 statuses';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} statuses`;
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

  onEditStatus(row: TableRow): void {
    const id = Number(row['id']);

    this.apiDataService.GET(`${ApiRoutesConstants.LEAD_STATUS_ADD}/${id}`).subscribe({
      next: (response: any) => {
        const status = response?.success ? response.data : this.statusesById.get(id);
        this.openAddPopup(status ?? null);
      },
      error: (err: any) => {
        this.toast.error('Failed to load status details. Please try again.');
        console.error('Failed to load status details:', err);
      },
    });
  }

  async onDeleteStatus(row: TableRow): Promise<void> {
    const confirmed = await this.toast.confirm(
      'Delete this status?',
      `${row['name'] ?? 'This status'} will be permanently removed.`
    );

    if (!confirmed) {
      return;
    }

    const path = `${ApiRoutesConstants.LEAD_STATUS_DELETE}/${row['id']}`;
    this.apiDataService.Delete(path, {}).subscribe({
      next: (response: any) => {
        if (response && response.success !== false) {
          this.toast.success('Status deleted successfully');
          this.loadStatuses();
        } else {
          this.toast.error(response?.message || 'Failed to delete status. Please try again.');
        }
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Failed to delete status. Please try again.');
        console.error('Failed to delete status:', err);
      },
    });
  }

  openAddPopup(data: any = null): void {
    const dialogRef = this.dialog.open(AddLeadStatusForm, {
      width: '420px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      data,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) return;
      this.loadStatuses();
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
  }

  private getFilteredRows(): TableRow[] {
    return this.allRows.filter((row) => {
      const haystack = String(row['name'] ?? '').toLowerCase();

      if (this.searchTerm && !haystack.includes(this.searchTerm)) return false;
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
