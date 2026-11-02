import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { Observable, finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { DepartmentOptionsService } from '../../../shared/common-services/department-options.service';
import { ToastService } from '../../../shared/common-services/toast.service';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { LocalListBase } from '../../../shared/components/local-list-base';
import { AutoModuleTabs } from '../../../shared/components/module-tabs/auto-module-tabs';
import { CanActionDirective } from '../../../shared/directives/can-action.directive';
import { FilterOption, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { displayDate } from '../../../shared/utils/format.util';
import { AddDepartmentForm } from './add-department-form/add-department-form';

/** Settings -> Department Module: the departments behind every Department dropdown and filter. */
@Component({
  selector: 'app-department',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, MatDialogModule, CommonFilterCard, CommonTableCard, CanActionDirective],
  templateUrl: './department.html',
  styleUrl: './department.scss',
})
export class Department extends LocalListBase implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly departmentOptions = inject(DepartmentOptionsService);

  protected readonly noun = 'departments';

  override filters: FilterOption[] = [{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }];

  columns: TableColumn[] = [
    { key: 'name', header: 'Department', type: 'text', width: '35%' },
    { key: 'employees', header: 'Employees', type: 'text', width: '15%' },
    { key: 'status', header: 'Status', type: 'badge', width: '15%' },
    { key: 'created_at', header: 'Created Date', type: 'text', width: '20%' },
    { key: 'action', header: 'Action', type: 'rowActions', width: '15%', sortable: false },
  ];

  override sortActive = '';
  override sortDirection: 'asc' | 'desc' = 'asc';

  /** Raw departments from GET /departments (every page). */
  private readonly items = signal<any[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loadDepartments();
  }

  loadDepartments(): void {
    this.loading.set(true);
    // GetAllPages walks every page of the paginated endpoint so the list is always complete.
    (this.api.GetAllPages(ApiRoutesConstants.DEPARTMENT_LIST) as Observable<any[]>)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: rows => {
          this.items.set(rows);
          this.currentPage = 1;
        },
        error: (err: any) => this.toast.error(err?.error?.message || 'Failed to load departments. Please try again.'),
      });
  }

  protected allRows(): TableRow[] {
    return this.items().map(d => ({
      id: d.id,
      name: d.name ?? '',
      employees: String(d.employees_count ?? 0), __employees: Number(d.employees_count ?? 0),
      status: Number(d.status) === 1 ? 'Active' : 'Inactive',
      created_at: d.created_at ? displayDate(String(d.created_at).slice(0, 10)) : '', __created_at: d.created_at ?? '',
    }));
  }

  openAddPopup(department: any = null): void {
    this.openDialog(AddDepartmentForm, department, '420px').afterClosed().subscribe(result => {
      if (!result) return;
      this.loadDepartments();
      this.departmentOptions.refresh(); // the other screens' dropdowns pick the change up
    });
  }

  onEditDepartment(row: TableRow): void {
    const id = Number(row['id']);
    this.api.GET(`${ApiRoutesConstants.DEPARTMENTS}/${id}`).subscribe({
      next: (res: any) => this.openAddPopup(res?.success ? res.data : this.items().find(d => d.id === id) ?? null),
      error: () => this.toast.error('Failed to load department details. Please try again.'),
    });
  }

  async onDeleteDepartment(row: TableRow): Promise<void> {
    const confirmed = await this.toast.confirm('Delete this department?', `${row['name'] ?? 'This department'} will be removed.`);
    if (!confirmed) return;

    this.api.Delete(`${ApiRoutesConstants.DEPARTMENTS}/${row['id']}`, {}).subscribe({
      next: (res: any) => {
        if (res && res.success !== false) {
          this.toast.success('Department deleted successfully');
          this.loadDepartments();
          this.departmentOptions.refresh();
        } else {
          this.toast.error(res?.message || 'Failed to delete department. Please try again.');
        }
      },
      // 422 when the department is still used by employees / manpower requests: the API says how many.
      error: (err: any) => this.toast.error(err?.error?.message || 'Failed to delete department. Please try again.'),
    });
  }
}
