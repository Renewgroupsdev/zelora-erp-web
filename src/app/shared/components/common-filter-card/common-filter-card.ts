import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilterOption } from '../../models/common-components.model';

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
  @Output() filterClick = new EventEmitter<string>();
  @Output() exportClick = new EventEmitter<void>();

  searchValue = '';
  openFilterKey: string | null = null;

  onSearchInput() {
    this.searchChange.emit(this.searchValue);
  }

  toggleFilter(key: string) {
    this.openFilterKey = this.openFilterKey === key ? null : key;
    this.filterClick.emit(key);
  }
}
