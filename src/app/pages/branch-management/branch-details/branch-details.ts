import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map } from 'rxjs';
import { AccountsService } from '../../../shared/common-services/accounts.service';
import { BranchService } from '../../../shared/common-services/branch.service';
import { inrShort } from '../../../shared/models/branch-franchise.model';
import { billTotals } from '../../../shared/models/accounts.model';
import { displayDate, initials, inr, isoDate } from '../../../shared/utils/format.util';
import { BranchForm } from '../branch-form/branch-form';

type Tab = 'overview' | 'employees' | 'customers' | 'sales';

/** One branch: identity, head, KPIs, sales overview and recent activity. */
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
  protected readonly store = inject(BranchService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly branch = computed(() => this.store.branch(this.id()));
  readonly tab = signal<Tab>('overview');
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'employees', label: 'Employees' }, { key: 'customers', label: 'Customers' }, { key: 'sales', label: 'Sales' },
  ];

  readonly inr = inr;
  readonly inrShort = inrShort;
  readonly initials = initials;
  readonly displayDate = displayDate;

  readonly employees = computed(() => this.branch() ? this.store.employees(this.branch()!.name) : []);
  readonly monthlySales = computed(() => this.branch() ? this.store.sales(this.branch()!.name, isoDate().slice(0, 7)) : 0);
  readonly chart = computed(() => {
    const b = this.branch();
    if (!b) return [];
    const days = this.store.dailySales(b.name, 7);
    const max = Math.max(1, ...days.map(d => d.value));
    return days.map(d => ({ ...d, height: Math.max(2, (d.value / max) * 100) }));
  });
  readonly activities = computed(() => this.branch() ? this.store.activities(this.branch()!.name) : []);

  readonly customers = computed(() => {
    const b = this.branch();
    if (!b) return [];
    const byName = new Map<string, { name: string; phone: string; bills: number; billed: number; last: string }>();
    for (const bill of this.acc.bills().filter(x => x.branch === b.name && x.kind === 'Service')) {
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
    const b = this.branch();
    return b ? this.acc.vouchers().filter(v => v.branch === b.name && (v.type === 'Sales' || v.type === 'Receipt')).sort((a, c) => c.date.localeCompare(a.date) || c.createdAt.localeCompare(a.createdAt)).slice(0, 15) : [];
  });

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
