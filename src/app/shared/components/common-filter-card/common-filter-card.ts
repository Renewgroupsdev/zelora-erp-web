import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonFilterState, FilterOption } from '../../models/common-components.model';

@Component({
  selector: 'app-common-filter-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './common-filter-card.html',
  styleUrl: './common-filter-card.scss',
})
export class CommonFilterCard {
  @Input() searchPlaceholder = 'Search...';
  @Input() filters: FilterOption[] = [];
  @Input() showExport = true;
  @Output() searchChange = new EventEmitter<string>();
  @Output() filtersChange = new EventEmitter<CommonFilterState>();
  @Output() filterClick = new EventEmitter<string>();
  @Output() exportClick = new EventEmitter<void>();

  searchValue = '';
  openFilterKey: string | null = null;

  filterValues: CommonFilterState = this.emptyState();
  draftValues: CommonFilterState = this.emptyState();

  onSearchInput(): void {
    this.searchChange.emit(this.searchValue);
  }

  toggleFilter(key: string): void {
    if (this.openFilterKey === key) {
      this.openFilterKey = null;
      return;
    }

    this.openFilterKey = key;
    this.draftValues = this.cloneState(this.filterValues);
    this.filterClick.emit(key);
  }

  isOpen(key: string): boolean {
    return this.openFilterKey === key;
  }

  isMultiSelected(branch: string): boolean {
    return this.draftValues.branch.includes(branch);
  }

  selectSingle(key: string, value: string): void {
    if (key === 'status' || key === 'source' || key === 'telecaller') {
      this.draftValues[key] = value || null;
    }
  }

  toggleBranch(branch: string): void {
    if (this.draftValues.branch.includes(branch)) {
      this.draftValues.branch = this.draftValues.branch.filter((item: string) => item !== branch);
    } else {
      this.draftValues.branch = [...this.draftValues.branch, branch];
    }
  }

  setDate(type: 'from' | 'to', value: string): void {
    if (type === 'from') {
      this.draftValues.dateFrom = value || null;
    } else {
      this.draftValues.dateTo = value || null;
    }
  }

  applyFilter(): void {
    if (this.draftValues.dateFrom && this.draftValues.dateTo && this.draftValues.dateFrom > this.draftValues.dateTo) {
      const from = this.draftValues.dateFrom;
      this.draftValues.dateFrom = this.draftValues.dateTo;
      this.draftValues.dateTo = from;
    }

    this.filterValues = this.cloneState(this.draftValues);
    this.filtersChange.emit(this.cloneState(this.filterValues));
    this.openFilterKey = null;
  }

  clearFilter(): void {
    this.draftValues = this.emptyState();
    this.filterValues = this.emptyState();
    this.filtersChange.emit(this.cloneState(this.filterValues));
    this.openFilterKey = null;
  }

  clearAll(): void {
    this.searchValue = '';
    this.searchChange.emit('');
    this.clearFilter();
  }

  getSelectedText(filter: FilterOption): string {
    if (filter.key === 'branch') {
      const count = this.draftValues.branch.length;
      return count ? `${count} selected` : `All ${filter.label}`;
    }

    if (filter.key === 'date') {
      if (!this.draftValues.dateFrom && !this.draftValues.dateTo) return 'All Dates';
      return `${this.draftValues.dateFrom || 'Start'} - ${this.draftValues.dateTo || 'End'}`;
    }

    const value = this.getSingleValue(filter.key);
    return value || `All ${filter.label}`;
  }

  hasValue(key: string): boolean {
    if (key === 'branch') return this.filterValues.branch.length > 0;
    if (key === 'date') return !!this.filterValues.dateFrom || !!this.filterValues.dateTo;
    return !!this.getSingleValueFromState(this.filterValues, key);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.filter-card')) {
      this.openFilterKey = null;
    }
  }

  private getSingleValue(key: string): string | null {
    return this.getSingleValueFromState(this.draftValues, key);
  }

  private getSingleValueFromState(state: CommonFilterState, key: string): string | null {
    if (key === 'status') return state.status;
    if (key === 'source') return state.source;
    if (key === 'telecaller') return state.telecaller;
    return null;
  }

  private emptyState(): CommonFilterState {
    return { status: null, source: null, branch: [], telecaller: null, dateFrom: null, dateTo: null };
  }

  private cloneState(state: CommonFilterState): CommonFilterState {
    return { ...state, branch: [...state.branch] };
  }
}
