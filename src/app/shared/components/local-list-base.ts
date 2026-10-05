import { Directive, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Sort, SortDirection } from '@angular/material/sort';
import {
  CommonFilterState,
  FilterOption,
  TableColumn,
  TablePageChangeEvent,
  TableRow,
} from '../models/common-components.model';

/**
 * Client-side search / filter / sort / paging for list pages whose data lives in a signal store
 * (Purchase, HR, Accounts). Rows may carry `__<columnKey>` fields holding the raw value to sort on
 * (e.g. a number behind a formatted ₹ amount). Re-runs automatically whenever the store changes.
 */
@Directive()
export abstract class LocalListBase {
  protected readonly dialog = inject(MatDialog);

  abstract columns: TableColumn[];
  filters: FilterOption[] = [];

  /**
   * Row fields each filter-card key matches against. The filter card has fixed keys, so pages
   * reuse `source` / `branch` for their own dimension (vendor, portal, department...).
   */
  protected filterFields: { status: string; source: string; branch: string[] } = { status: 'status', source: 'source', branch: ['branch'] };

  readonly pageSizeOptions = [10, 30, 50, 100];
  rows: TableRow[] = [];
  totalRecords = 0;
  currentPage = 1;
  pageSize = 10;
  sortActive = '';
  sortDirection: SortDirection = 'desc';
  protected searchTerm = '';
  protected filterState: CommonFilterState = { status: null, source: null, branch: [], telecaller: null, dateFrom: null, dateTo: null };

  /** Every row before filtering; read signals here so the table tracks store changes. */
  protected abstract allRows(): TableRow[];
  protected abstract readonly noun: string;

  /** Rows after search + filters, before paging - what an Excel export should contain. */
  protected filteredRows: TableRow[] = [];

  constructor() {
    effect(() => this.refresh());
  }

  refresh(): void {
    const term = this.searchTerm.toLowerCase();
    const f = this.filterState;
    const fields = this.filterFields;
    const branchOf = (row: TableRow) => fields.branch.map(k => row[k]).find(v => v !== undefined);

    let list = this.allRows().filter(row => {
      if (f.status && row[fields.status] !== f.status) return false;
      if (f.source && row[fields.source] !== f.source) return false;
      if (f.branch.length && !f.branch.includes(String(branchOf(row)))) return false;
      // Date filter applies to rows that carry an ISO `__date` (YYYY-MM-DD...).
      const day = typeof row['__date'] === 'string' ? row['__date'].slice(0, 10) : null;
      if (day && f.dateFrom && day < f.dateFrom) return false;
      if (day && f.dateTo && day > f.dateTo) return false;
      if (!term) return true;
      // Rows with object cells (e.g. `lead`) can supply a flat `searchText` to match on.
      if (typeof row['searchText'] === 'string' && row['searchText'].toLowerCase().includes(term)) return true;
      return this.columns.some(c => typeof row[c.key] === 'string' && (row[c.key] as string).toLowerCase().includes(term));
    });

    if (this.sortActive) {
      const key = this.sortActive;
      const dir = this.sortDirection === 'asc' ? 1 : -1;
      const val = (r: TableRow) => (r[`__${key}`] ?? r[key]) as string | number;
      list = [...list].sort((a, b) => {
        const x = val(a), y = val(b);
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
      });
    }

    this.filteredRows = list;
    this.totalRecords = list.length;
    const maxPage = Math.max(1, Math.ceil(list.length / this.pageSize));
    if (this.currentPage > maxPage) this.currentPage = maxPage;
    const start = (this.currentPage - 1) * this.pageSize;
    this.rows = list.slice(start, start + this.pageSize);
  }

  onSearch(term: string): void {
    this.searchTerm = term.trim();
    this.currentPage = 1;
    this.refresh();
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.currentPage = 1;
    this.refresh();
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.currentPage = event.page;
    this.pageSize = event.pageSize;
    this.refresh();
  }

  onSortChange(sort: Sort): void {
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || 'asc';
    this.currentPage = 1;
    this.refresh();
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) return `Showing 0 ${this.noun}`;
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} ${this.noun}`;
  }

  /** Visible (non-action) columns of the filtered rows, ready for `downloadExcel`. */
  protected exportSheet(name: string) {
    const columns = this.columns
      .filter(c => c.type !== 'quickActions' && c.type !== 'rowActions' && c.type !== 'action')
      .map(c => ({ header: c.header, key: c.key }));
    const rows = this.filteredRows.map(r => Object.fromEntries(columns.map(c => {
      const raw = r[`__${c.key}`];
      return [c.key, typeof raw === 'number' ? raw : r[c.key]];
    })));
    return { name, columns, rows };
  }

  /** Same sizing every ERP dialog uses. */
  protected openDialog<T, R = unknown>(component: new (...args: any[]) => T, data: unknown, width = '820px') {
    return this.dialog.open<T, unknown, R>(component, {
      width,
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      data,
    });
  }
}
