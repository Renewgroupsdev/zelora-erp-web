import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map } from 'rxjs';
import { CrmFlowService } from '../../../shared/common-services/crm-flow.service';
import { FranchiseService } from '../../../shared/common-services/franchise.service';
import { HrService } from '../../../shared/common-services/hr.service';
import { TargetsService } from '../../../shared/common-services/targets.service';
import { axisShort, chartTicks, inrShort, invoiceTotal, lastMonths, splitShare, timeAgo } from '../../../shared/models/branch-franchise.model';
import { displayDate, initials, inr, isoDate } from '../../../shared/utils/format.util';
import { FranchiseForm } from '../franchise-form/franchise-form';

type Tab = 'overview' | 'agreement' | 'employees' | 'leads' | 'customers' | 'appointments' | 'sales' | 'inventory' | 'reports';

/** SVG geometry for the sales trend chart. */
const W = 560;
const H = 210;
const PAD = { left: 40, right: 12, top: 10, bottom: 24 };

/** One franchise partner: owner, agreement, revenue share, sales trend and invoices. */
@Component({
  selector: 'app-franchise-details',
  standalone: true,
  imports: [CommonModule, RouterLink, MatDialogModule],
  templateUrl: './franchise-details.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise.scss'],
})
export class FranchiseDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly crm = inject(CrmFlowService);
  private readonly hr = inject(HrService);
  private readonly targets = inject(TargetsService);
  protected readonly store = inject(FranchiseService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly franchise = computed(() => this.store.franchise(this.id()));
  readonly tab = signal<Tab>('overview');
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'agreement', label: 'Agreement' }, { key: 'employees', label: 'Employees' },
    { key: 'leads', label: 'Leads' }, { key: 'customers', label: 'Customers' }, { key: 'appointments', label: 'Appointments' },
    { key: 'sales', label: 'Sales' }, { key: 'inventory', label: 'Inventory' }, { key: 'reports', label: 'Reports' },
  ];

  readonly inr = inr;
  readonly inrShort = inrShort;
  readonly initials = initials;
  readonly displayDate = displayDate;
  readonly invoiceTotal = invoiceTotal;
  readonly splitShare = splitShare;
  readonly timeAgo = timeAgo;
  readonly chartW = W;
  readonly chartH = H;

  readonly invoices = computed(() => this.store.invoicesOf(this.id()));
  readonly totals = computed(() => this.store.totalsFor(this.id()));
  readonly monthSales = computed(() => this.invoices().filter(i => i.date.startsWith(isoDate().slice(0, 7))).reduce((s, i) => s + invoiceTotal(i.items), 0));
  readonly unpaid = computed(() => this.invoices().filter(i => i.status === 'Unpaid').reduce((s, i) => s + invoiceTotal(i.items), 0));
  readonly activities = computed(() => this.invoices().slice(0, 5));
  readonly staff = computed(() => (this.franchise() ? this.hr.employees().filter(e => e.branch === this.franchise()!.name && e.status !== 'Exited') : []));

  readonly customers = computed(() => {
    const byName = new Map<string, { name: string; invoices: number; billed: number; last: string }>();
    for (const inv of this.invoices()) {
      const key = inv.customer.toLowerCase();
      const row = byName.get(key) ?? { name: inv.customer, invoices: 0, billed: 0, last: '' };
      row.invoices++;
      row.billed += invoiceTotal(inv.items);
      if (inv.date > row.last) row.last = inv.date;
      byName.set(key, row);
    }
    return [...byName.values()].sort((a, b) => b.last.localeCompare(a.last));
  });

  /** Monthly invoice value + share split, newest first (Reports tab). */
  readonly monthly = computed(() => {
    const share = this.franchise()?.sharePercent ?? 70;
    return lastMonths(7).map(m => {
      const list = this.invoices().filter(i => i.date.startsWith(m.key));
      const total = list.reduce((s, i) => s + invoiceTotal(i.items), 0);
      return { ...m, count: list.length, ...splitShare(total, share), target: this.targets.targetFor(this.franchise()?.name ?? '', m.key).revenueTarget };
    }).reverse();
  });

  /** Line chart: sales per month, plus a target line when targets exist for the outlet. */
  readonly chart = computed(() => {
    const data = [...this.monthly()].reverse();
    const hasTarget = data.some(d => d.target > 0);
    const ticks = chartTicks(Math.max(0, ...data.map(d => Math.max(d.total, d.target))));
    const top = ticks[ticks.length - 1] || 1;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
    const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
    const pts = data.map((d, i) => ({ x: x(i), y: y(d.total), label: d.label, value: d.total }));
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const base = PAD.top + innerH;
    return {
      pts,
      line,
      area: pts.length ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z` : '',
      target: hasTarget ? data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.target).toFixed(1)}`).join(' ') : '',
      grid: ticks.map(t => ({ y: y(t), label: axisShort(t) })),
      left: PAD.left,
      right: W - PAD.right,
      labelY: H - 6,
    };
  });

  leads() {
    return this.crm.getFollowUps().filter(l => l.branch === this.franchise()?.name);
  }

  appointments() {
    return this.crm.getAppointments().filter(a => a.branch === this.franchise()?.name);
  }

  edit(): void {
    if (!this.franchise()) return;
    this.dialog.open(FranchiseForm, { width: '860px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { franchiseId: this.franchise()!.id } });
  }

  back(): void {
    this.router.navigate(['/app/franchises']);
  }
}
