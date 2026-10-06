import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map } from 'rxjs';
import { FranchiseService } from '../../../shared/common-services/franchise.service';
import { inrShort, invoiceTotal, splitShare } from '../../../shared/models/branch-franchise.model';
import { displayDate, initials, inr, isoDate } from '../../../shared/utils/format.util';
import { FranchiseForm } from '../franchise-form/franchise-form';

type Tab = 'overview' | 'agreement' | 'invoices';

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
  protected readonly store = inject(FranchiseService);

  readonly id = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly franchise = computed(() => this.store.franchise(this.id()));
  readonly tab = signal<Tab>('overview');
  readonly tabs: { key: Tab; label: string }[] = [{ key: 'overview', label: 'Overview' }, { key: 'agreement', label: 'Agreement' }, { key: 'invoices', label: 'Invoices' }];

  readonly inr = inr;
  readonly inrShort = inrShort;
  readonly initials = initials;
  readonly displayDate = displayDate;
  readonly invoiceTotal = invoiceTotal;
  readonly splitShare = splitShare;

  readonly invoices = computed(() => this.store.invoicesOf(this.id()));
  readonly totals = computed(() => this.store.totalsFor(this.id()));
  readonly customers = computed(() => new Set(this.invoices().map(i => i.customer.toLowerCase())).size);
  readonly monthSales = computed(() => this.invoices().filter(i => i.date.startsWith(isoDate().slice(0, 7))).reduce((s, i) => s + invoiceTotal(i.items), 0));
  readonly unpaid = computed(() => this.invoices().filter(i => i.status === 'Unpaid').reduce((s, i) => s + invoiceTotal(i.items), 0));
  readonly chart = computed(() => {
    const data = this.store.monthlySales(this.id());
    const max = Math.max(1, ...data.map(d => d.value));
    return data.map(d => ({ ...d, height: Math.max(2, (d.value / max) * 100) }));
  });
  readonly activities = computed(() => this.invoices().slice(0, 6));

  edit(): void {
    if (!this.franchise()) return;
    this.dialog.open(FranchiseForm, { width: '860px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, disableClose: true, data: { franchiseId: this.franchise()!.id } });
  }

  back(): void {
    this.router.navigate(['/app/franchises']);
  }
}
