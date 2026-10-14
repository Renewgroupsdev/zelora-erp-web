import { Directive, OnInit, inject } from '@angular/core';
import { LocalListBase } from '../../../shared/components/local-list-base';
import { PurchaseCollection, PurchaseService } from '../../../shared/common-services/purchase.service';

export type { PurchaseCollection };

/** Purchase Management list pages: the `source` filter is the vendor, `branch` covers branch or store. */
@Directive()
export abstract class PurchaseListBase extends LocalListBase implements OnInit {
  protected readonly purchase = inject(PurchaseService);
  protected override filterFields = { status: 'status', source: 'vendor', branch: ['branch', 'store'] };

  /** The /api/purchase lists this tab shows - fetched every time the tab opens, and only these. */
  protected abstract readonly collections: PurchaseCollection[];

  ngOnInit(): void {
    void this.purchase.load(...this.collections);
  }
}
