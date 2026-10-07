import { Directive, computed, inject } from '@angular/core';
import { AccountsService } from '../../shared/common-services/accounts.service';
import { LocalListBase } from '../../shared/components/local-list-base';
import { ModuleTab } from '../../shared/components/module-tabs/module-tabs';
import { isoDate } from '../../shared/utils/format.util';

export function accountsTabs(acc: AccountsService): ModuleTab[] {
  // Past days with entries that were never closed - they hold up the next day's opening balance.
  const today = isoDate();
  const openDays = new Set(acc.vouchers().filter(v => v.date < today && !acc.isClosed(v.date)).map(v => v.date)).size;
  return [
    { label: 'Day Book', icon: 'bi-journal-bookmark-fill', path: '/app/accounts/day-book', badge: openDays },
    { label: 'Bills', icon: 'bi-receipt', path: '/app/accounts/bills', badge: acc.bills().filter(b => b.kind === 'Service' && (b.status === 'Unpaid' || b.status === 'Partially Paid')).length, warn: true },
    { label: 'Vouchers', icon: 'bi-arrow-left-right', path: '/app/accounts/vouchers' },
    { label: 'Ledgers & Reports', icon: 'bi-journals', path: '/app/accounts/ledgers' },
    { label: 'Targets', icon: 'bi-bullseye', path: '/app/accounts/targets' },
  ];
}

/** Accounts list pages: `source` filter = voucher type / bill kind, `branch` = branch. */
@Directive()
export abstract class AccountsListBase extends LocalListBase {
  protected readonly acc = inject(AccountsService);
  protected override filterFields = { status: 'status', source: 'source', branch: ['branch'] };

  readonly tabs = computed<ModuleTab[]>(() => accountsTabs(this.acc));
}
