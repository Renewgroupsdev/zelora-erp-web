import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonFilterState, FilterOption } from '../../../shared/models/common-components.model';
import { ApiDataService } from '../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { AddServiceCategoryForm } from './add-service-category-form/add-service-category-form';

/** One category node in the parent/child tree - a top-level category carries its sub-categories
 *  in `children`; a sub-category's `children` array stays empty (this schema is only 2 levels deep). */
interface CategoryNode {
  id: number;
  name: string;
  statusLabel: 'Active' | 'Inactive';
  createdAt: string;
  children: CategoryNode[];
  expanded: boolean;
}

@Component({
  selector: 'app-service-category',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonFilterCard],
  templateUrl: './service-category.html',
  styleUrl: './service-category.scss',
})
export class ServiceCategory implements OnInit {

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

  isLoading = false;
  totalRecords = 0;
  categories: CategoryNode[] = [];
  filteredCategories: CategoryNode[] = [];

  /** Raw category records from the API, keyed by id, so the edit form can be pre-filled with
   *  fields the tree node doesn't carry. */
  private categoriesById = new Map<number, any>();
  private searchTerm = '';

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.isLoading = true;

    // GetAllPages walks every page of the (paginated) endpoint - a category only nests under
    // its parent if the parent's page was fetched too, otherwise a parent pushed onto page 2+
    // leaves its children looking like top-level rows.
    this.apiDataService.GetAllPages(ApiRoutesConstants.SERVICE_CATEGORY_GET_List).subscribe({
      next: (categories: any[]) => {
        this.isLoading = false;

        this.categoriesById.clear();
        categories.forEach((category: any) => this.categoriesById.set(category.id, category));

        this.totalRecords = categories.length;
        this.categories = this.buildTree(categories);
        this.applyFilters();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toast.error('Failed to load service categories. Please try again.');
        console.error('Failed to load service categories:', err);
      },
    });
  }

  /** Groups the flat API list into top-level categories with their sub-categories nested
   *  underneath - `nodesById` is keyed by id so a repeated id in the payload collapses to one
   *  node instead of showing twice. */
  private buildTree(categories: any[]): CategoryNode[] {
    const nodesById = new Map<number, CategoryNode>();

    categories.forEach((category) => {
      if (nodesById.has(category.id)) return;

      nodesById.set(category.id, {
        id: category.id,
        name: category.name ?? '',
        statusLabel: this.formatStatus(category.status),
        createdAt: this.formatDate(category.created_at),
        children: [],
        expanded: false,
      });
    });

    const roots: CategoryNode[] = [];

    categories.forEach((category) => {
      const node = nodesById.get(category.id);
      if (!node) return;

      const parentNode = category.parent_id ? nodesById.get(category.parent_id) : undefined;
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /** status comes back as 1/0 - map to the Active/Inactive labels the badge and filter use. */
  private formatStatus(status: unknown): 'Active' | 'Inactive' {
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

  toggleExpand(node: CategoryNode): void {
    node.expanded = !node.expanded;
  }

  onSearch(term: string): void {
    this.searchTerm = term.trim().toLowerCase();
    this.applyFilters();
  }

  onFilterClick(key: string): void {
    console.debug('Filter opened:', key);
  }

  onFiltersChange(filters: CommonFilterState): void {
    this.filterState = { ...filters, branch: [...filters.branch] };
    this.applyFilters();
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  /** A parent matching the filter keeps all of its children; otherwise only the matching
   *  children survive - and if any did, the parent is force-expanded so they're visible. */
  private applyFilters(): void {
    const term = this.searchTerm;
    const status = this.filterState.status;

    if (!term && !status) {
      this.filteredCategories = this.categories;
      return;
    }

    const matches = (node: CategoryNode) =>
      (!term || node.name.toLowerCase().includes(term)) &&
      (!status || node.statusLabel === status);

    this.filteredCategories = this.categories.reduce<CategoryNode[]>((result, parent) => {
      const parentMatches = matches(parent);
      const matchingChildren = parent.children.filter(matches);

      if (parentMatches || matchingChildren.length) {
        result.push({
          ...parent,
          children: parentMatches ? parent.children : matchingChildren,
          expanded: true,
        });
      }

      return result;
    }, []);
  }

  onAddCategory(): void {
    this.openAddPopup(null);
  }

  onAddSubCategory(parent: CategoryNode, event: Event): void {
    event.stopPropagation();
    this.openAddPopup({ parent_id: parent.id });
  }

  onEditCategory(node: CategoryNode, event: Event): void {
    event.stopPropagation();
    const category = this.categoriesById.get(node.id);
    this.openAddPopup(category ?? null);
  }

  async onDeleteCategory(node: CategoryNode, event: Event): Promise<void> {
    event.stopPropagation();

    const confirmed = await this.toast.confirm(
      'Delete this category?',
      node.children.length
        ? `${node.name} and its ${node.children.length} sub-categories will be permanently removed.`
        : `${node.name} will be permanently removed.`
    );

    if (!confirmed) {
      return;
    }

    const path = `${ApiRoutesConstants.SERVICE_CATEGORY_DELETE}/${node.id}`;
    this.apiDataService.Delete(path, {}).subscribe({
      next: (response: any) => {
        if (response && response.success !== false) {
          this.toast.success('Category deleted successfully');
          this.loadCategories();
        } else {
          this.toast.error(response?.message || 'Failed to delete category. Please try again.');
        }
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Failed to delete category. Please try again.');
        console.error('Failed to delete category:', err);
      },
    });
  }

  openAddPopup(data: any = null): void {
    const dialogRef = this.dialog.open(AddServiceCategoryForm, {
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: false,
      restoreFocus: true,
      disableClose: true,
      data,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) return;
      this.loadCategories();
    });
  }
}
