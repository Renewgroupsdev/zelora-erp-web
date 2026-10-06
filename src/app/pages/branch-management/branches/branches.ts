import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { BranchService } from '../../../shared/common-services/branch.service';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { LocalListBase } from '../../../shared/components/local-list-base';
import { DetailCardData, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { inrShort } from '../../../shared/models/branch-franchise.model';
import { downloadExcel, fileStamp } from '../../../shared/utils/export.util';
import { addDays, isoDate } from '../../../shared/utils/format.util';
import { BranchForm } from '../branch-form/branch-form';

/** Branch Management: every company owned branch with its head, customers and monthly sales. */
@Component({
  selector: 'app-branches',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './branches.html',
  styleUrl: '../../../shared/styles/erp-page.scss',
})
export class Branches extends LocalListBase {
  private readonly store = inject(BranchService);
  private readonly router = inject(Router);

  protected readonly noun = 'branches';
  protected override filterFields = { status: 'status', source: 'city', branch: ['name'] };

  override filters = [
    { key: 'status', label: 'Status', options: ['Active', 'Inactive'] },
    { key: 'source', label: 'City', options: [...new Set(this.store.branches().map(b => b.city))].sort() },
  ];

  columns: TableColumn[] = [
    { key: 'code', header: 'Code', width: '7%' },
    { key: 'branchName', header: 'Branch Name', type: 'lead', width: '16%' },
    { key: 'head', header: 'Branch Head', width: '13%' },
    { key: 'city', header: 'City', width: '10%' },
    { key: 'state', header: 'State', width: '10%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'customers', header: 'Total Customers', width: '11%' },
    { key: 'sales', header: 'Monthly Sales', width: '12%' },
    { key: 'actions', header: 'Actions', type: 'quickActions', width: '8%', sortable: false },
  ];

  override sortActive = 'code';
  override sortDirection: 'asc' | 'desc' = 'asc';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.store.branches();
    const active = list.filter(b => b.status === 'Active');
    const month = isoDate().slice(0, 7);
    const prev = addDays(`${month}-01`, -1).slice(0, 7);
    const sales = list.reduce((s, b) => s + this.store.sales(b.name, month), 0);
    const prevSales = list.reduce((s, b) => s + this.store.sales(b.name, prev), 0);
    const growth = prevSales ? Math.round(((sales - prevSales) / prevSales) * 100) : null;
    const employees = list.reduce((s, b) => s + this.store.employees(b.name).length, 0);
    return [
      { label: 'Total Branches', value: list.length, icon: 'bi-building', iconVariant: 'primary' },
      { label: 'Active Branches', value: active.length, trendText: `${list.length ? Math.round((active.length / list.length) * 100) : 0}% active`, trendDirection: 'up', icon: 'bi-check-circle-fill', iconVariant: 'green' },
      { label: 'Total Employees', value: employees, icon: 'bi-people-fill', iconVariant: 'blue' },
      { label: 'Monthly Sales', value: inrShort(sales), trendText: growth === null ? 'This month' : `${growth >= 0 ? '+' : ''}${growth}% vs last month`, trendDirection: growth !== null && growth < 0 ? 'down' : 'up', icon: 'bi-currency-rupee', iconVariant: 'orange' },
    ];
  });

  protected allRows(): TableRow[] {
    const month = isoDate().slice(0, 7);
    return this.store.branches().map(b => {
      const sales = this.store.sales(b.name, month);
      return {
        id: b.id,
        code: b.code,
        branchName: { name: b.name, subtitle: b.phone },
        __branchName: b.name,
        searchText: `${b.name} ${b.headName} ${b.city} ${b.code}`,
        name: b.name,
        head: b.headName,
        city: b.city,
        state: b.state,
        status: b.status,
        customers: String(this.store.customers(b.name)), __customers: this.store.customers(b.name),
        sales: `₹${Math.round(sales).toLocaleString('en-IN')}`, __sales: sales,
        actions: [
          { key: 'view', icon: 'bi-eye-fill', label: 'View branch', variant: 'primary' },
          { key: 'edit', icon: 'bi-pencil-fill', label: 'Edit' },
        ],
      };
    });
  }

  addBranch(): void {
    this.openDialog(BranchForm, {}, '860px');
  }

  open(row: TableRow): void {
    this.router.navigate(['/app/branches', row['id']]);
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    if (event.action === 'view') this.open(event.row);
    if (event.action === 'edit') this.openDialog(BranchForm, { branchId: event.row['id'] }, '860px');
  }

  exportExcel(): void {
    downloadExcel(`branches-${fileStamp()}`, [this.exportSheet('Branches')]);
  }
}
