import { Directive, inject } from '@angular/core';
import { LocalListBase } from '../../../shared/components/local-list-base';
import { PurchaseService } from '../../../shared/common-services/purchase.service';

/** Purchase Management list pages: the `source` filter is the vendor, `branch` covers branch or store. */
@Directive()
export abstract class PurchaseListBase extends LocalListBase {
  protected readonly purchase = inject(PurchaseService);
  protected override filterFields = { status: 'status', source: 'vendor', branch: ['branch', 'store'] };
}
