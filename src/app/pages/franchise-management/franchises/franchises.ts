import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogModule } from '@angular/material/dialog';
import { FranchiseService } from '../../../shared/common-services/franchise.service';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { LocalListBase } from '../../../shared/components/local-list-base';
import { DetailCardData, TableColumn, TableRow } from '../../../shared/models/common-components.model';
import { inrShort } from '../../../shared/models/branch-franchise.model';
import { downloadExcel, fileStamp } from '../../../shared/utils/export.util';
import { FranchiseForm } from '../franchise-form/franchise-form';

/** Franchise Management: partner outlets with their sales and the Renew company share. */
@Component({
  selector: 'app-franchises',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard],
  templateUrl: './franchises.html',
  styleUrl: '../../../shared/styles/erp-page.scss',
})
export class Franchises extends LocalListBase {
  private readonly store = inject(FranchiseService);
  private readonly router = inject(Router);

  protected readonly noun = 'franchises';
  protected override filterFields = { status: 'status', source: 'city', branch: ['name'] };

  override filters = [
    { key: 'status', label: 'Status', options: ['Active', 'Pending', 'Inactive'] },
    { key: 'source', label: 'City', options: [...new Set(this.store.franchises().map(f => f.city))].sort() },
  ];

  columns: TableColumn[] = [
    { key: 'code', header: 'Code', width: '7%' },
    { key: 'franchiseName', header: 'Franchise Name', type: 'lead', width: '15%' },
    { key: 'owner', header: 'Owner Name', width: '14%' },
    { key: 'city', header: 'City', width: '9%' },
    { key: 'state', header: 'State', width: '9%' },
    { key: 'status', header: 'Status', type: 'badge', width: '8%' },
    { key: 'sales', header: 'Total Sales', width: '11%' },
    { key: 'renew', header: 'Renew Share', width: '11%' },
    { key: 'actions', header: 'Actions', type: 'quickActions', width: '8%', sortable: false },
  ];

  override sortActive = 'code';
  override sortDirection: 'asc' | 'desc' = 'asc';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.store.franchises();
    const overall = this.store.overall();
    return [
      { label: 'Total Franchises', value: list.length, icon: 'bi-shop', iconVariant: 'primary' },
      { label: 'Active Franchises', value: list.filter(f => f.status === 'Active').length, icon: 'bi-check-circle-fill', iconVariant: 'green' },
      { label: 'Pending', value: list.filter(f => f.status === 'Pending').length, icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Total Sales', value: inrShort(overall.total), icon: 'bi-currency-rupee', iconVariant: 'blue' },
      { label: 'Renew Share (Company)', value: inrShort(overall.renew), trendText: `${overall.renewPercent}% of total`, trendDirection: 'up', icon: 'bi-percent', iconVariant: 'purple' },
    ];
  });

  protected allRows(): TableRow[] {
    return this.store.franchises().map(f => {
      const t = this.store.totalsFor(f.id);
      return {
        id: f.id,
        code: f.code,
        franchiseName: { name: f.name, subtitle: f.ownerCompany },
        __franchiseName: f.name,
        searchText: `${f.name} ${f.ownerCompany} ${f.ownerName} ${f.city} ${f.code}`,
        name: f.name,
        owner: f.ownerCompany,
        city: f.city,
        state: f.state,
        status: f.status,
        sales: `₹${Math.round(t.total).toLocaleString('en-IN')}`, __sales: t.total,
        renew: `₹${Math.round(t.renew).toLocaleString('en-IN')}`, __renew: t.renew,
        actions: [
          { key: 'view', icon: 'bi-eye-fill', label: 'View franchise', variant: 'primary' },
          { key: 'edit', icon: 'bi-pencil-fill', label: 'Edit' },
        ],
      };
    });
  }

  addFranchise(): void {
    this.openDialog(FranchiseForm, {}, '860px');
  }

  onQuickAction(event: { row: TableRow; action: string }): void {
    if (event.action === 'view') this.router.navigate(['/app/franchises', event.row['id']]);
    if (event.action === 'edit') this.openDialog(FranchiseForm, { franchiseId: event.row['id'] }, '860px');
  }

  exportExcel(): void {
    downloadExcel(`franchises-${fileStamp()}`, [this.exportSheet('Franchises')]);
  }
}
