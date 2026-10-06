import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map } from 'rxjs';
import { AccountsService } from '../../../shared/common-services/accounts.service';
import { BranchService } from '../../../shared/common-services/branch.service';
import { CrmFlowService } from '../../../shared/common-services/crm-flow.service';
import { axisShort, chartTicks, inrShort } from '../../../shared/models/branch-franchise.model';
import { billTotals } from '../../../shared/models/accounts.model';
import { displayDate, initials, inr, isoDate } from '../../../shared/utils/format.util';
import { BranchForm } from '../branch-form/branch-form';

type Tab = 'overview' | 'employees' | 'leads' | 'customers' | 'appointments' | 'sales' | 'inventory' | 'reports';

/** One branch: identity, head, KPIs, sales vs target and recent activity, plus per-module tabs. */
@Component({
  selector: 'app-branch-details',
  standalone: true,
  imports: [CommonModule, RouterLink, MatDialogModule],
  templateUrl: './branch-details.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise.scss'],
})
export class BranchDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly acc = inject(AccountsService);
  private readonly crm = inject(CrmFlowService);
  protected readonly store = inject(BranchService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly branch = computed(() => this.store.branch(this.id()));
  readonly tab = signal<Tab>('overview');
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'employees', label: 'Employees' }, { key: 'leads', label: 'Leads' },
    { key: 'customers', label: 'Customers' }, { key: 'appointments', label: 'Appointments' }, { key: 'sales', label: 'Sales' },
    { key: 'inventory', label: 'Inventory' }, { key: 'reports', label: 'Reports' },
  ];

  readonly inr = inr;
  readonly inrShort = inrShort;
  readonly axisShort = axisShort;
  readonly initials = initials;
  readonly displayDate = displayDate;

  private readonly name = computed(() => this.branch()?.name ?? '');
  readonly employees = computed(() => (this.name() ? this.store.employees(this.name()) : []));
  readonly monthlySales = computed(() => (this.name() ? this.store.sales(this.name(), isoDate().slice(0, 7)) : 0));
  readonly inventoryValue = computed(() => (this.name() ? this.store.inventoryValue(this.name()) : 0));
  readonly stock = computed(() => (this.name() ? this.store.stock(this.name()) : []));
  readonly activities = computed(() => (this.name() ? this.store.activities(this.name()) : []));

  /** Sales vs target bars for the last 7 months. */
  readonly series = computed(() => (this.name() ? this.store.monthlySeries(this.name()) : []));
  readonly hasTarget = computed(() => this.series().some(m => m.target > 0));
  readonly ticks = computed(() => chartTicks(Math.max(...this.series().map(m => Math.max(m.sales, m.target)), 0)));
  readonly bars = computed(() => {
    const top = this.ticks()[this.ticks().length - 1] || 1;
    return this.series().map(m => ({ ...m, salesH: (m.sales / top) * 100, targetH: (m.target / top) * 100 }));
  });

  readonly customers = computed(() => {
    const name = this.name();
    if (!name) return [];
    const byName = new Map<string, { name: string; phone: string; bills: number; billed: number; last: string }>();
    for (const bill of this.acc.bills().filter(x => x.branch === name && x.kind === 'Service')) {
      const key = bill.customerName.toLowerCase();
      const row = byName.get(key) ?? { name: bill.customerName, phone: bill.customerPhone, bills: 0, billed: 0, last: '' };
      row.bills++;
      row.billed += billTotals(bill.items).grandTotal;
      if (bill.date > row.last) row.last = bill.date;
      byName.set(key, row);
    }
    return [...byName.values()].sort((a, c) => c.last.localeCompare(a.last));
  });

  readonly sales = computed(() => {
    const name = this.name();
    return name ? this.acc.vouchers().filter(v => v.branch === name && (v.type === 'Sales' || v.type === 'Receipt')).sort((a, c) => c.date.localeCompare(a.date) || c.createdAt.localeCompare(a.createdAt)).slice(0, 15) : [];
  });

  /** CRM workflow data is held in memory by CrmFlowService (not signals), so read it when the tab renders. */
  leads() {
    return this.crm.getFollowUps().filter(l => l.branch === this.name());
  }

  appointments() {
    return this.crm.getAppointments().filter(a => a.branch === this.name());
  }

  achievement(sales: number, target: number): string {
    return target ? `${Math.round((sales / target) * 100)}%` : '-';
  }

  amount(voucher: { entries: { debit: number }[] }): number {
    return voucher.entries.reduce((s, e) => s + e.debit, 0);
  }

  edit(): void {
    if (!this.branch()) return;
    this.dialog.open(BranchForm, { width: '860px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { branchId: this.branch()!.id } });
  }

  back(): void {
    this.router.navigate(['/app/branches']);
  }
}
