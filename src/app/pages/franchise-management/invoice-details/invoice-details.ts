import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, map } from 'rxjs';
import { FranchiseService } from '../../../shared/common-services/franchise.service';
import { invoiceTotal, splitShare } from '../../../shared/models/branch-franchise.model';
import { displayDate, inr } from '../../../shared/utils/format.util';

type Tab = 'items' | 'share' | 'notes';

/** One franchise invoice with its 70 / 30 style split between the partner and Renew. */
@Component({
  selector: 'app-franchise-invoice-details',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './invoice-details.html',
  styleUrls: ['../../../shared/styles/erp-page.scss', '../../../shared/styles/branch-franchise.scss'],
})
export class InvoiceDetails {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(FranchiseService);

  private readonly params = toSignal(combineLatest([this.route.paramMap]).pipe(map(([p]) => ({ id: p.get('id') ?? '', no: p.get('invoiceNo') ?? '' }))), { initialValue: { id: '', no: '' } });
  readonly franchise = computed(() => this.store.franchise(this.params().id));
  readonly invoice = computed(() => this.store.invoice(this.params().id, this.params().no));
  readonly tab = signal<Tab>('items');
  readonly tabs: { key: Tab; label: string }[] = [{ key: 'items', label: 'Invoice Items' }, { key: 'share', label: 'Share Details' }, { key: 'notes', label: 'Notes' }];

  readonly inr = inr;
  readonly displayDate = displayDate;
  readonly total = computed(() => invoiceTotal(this.invoice()?.items ?? []));
  readonly split = computed(() => splitShare(this.total(), this.franchise()?.sharePercent ?? 70));
  /** Doughnut: franchise slice first, Renew slice after. */
  readonly ring = computed(() => `conic-gradient(var(--primary) 0 ${this.franchise()?.sharePercent ?? 70}%, var(--status-green-text) 0 100%)`);

  lineSplit(qty: number, unitPrice: number) {
    return splitShare(qty * unitPrice, this.franchise()?.sharePercent ?? 70);
  }

  print(): void {
    window.print();
  }
}
