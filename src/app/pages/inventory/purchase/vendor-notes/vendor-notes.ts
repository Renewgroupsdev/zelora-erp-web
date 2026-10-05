import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, FilterOption, QuickAction, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { ToastService } from '../../../../shared/common-services/toast.service';
import { displayDate, inr } from '../../../../shared/models/purchase.model';
import { PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';

/** Credit / debit notes raised during purchase inward / return for damaged, short or rate-difference items. */
@Component({
  selector: 'app-vendor-notes',
  standalone: true,
  imports: [CommonModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './vendor-notes.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class VendorNotes extends PurchaseListBase {
  private readonly toast = inject(ToastService);
  protected readonly noun = 'notes';

  readonly vendorFilters = computed<FilterOption[]>(() => [
    { key: 'status', label: 'Status', options: ['Open', 'Adjusted'] },
    { key: 'source', label: 'Vendor', options: [...new Set(this.purchase.notes().map(n => n.vendorName))] },
  ]);

  columns: TableColumn[] = [
    { key: 'noteNo', header: 'Note No', width: '10%' },
    { key: 'type', header: 'Type', type: 'badge', width: '9%' },
    { key: 'vendor', header: 'Vendor', width: '14%' },
    { key: 'poNo', header: 'PO No', width: '10%' },
    { key: 'grnNo', header: 'GRN No', width: '10%' },
    { key: 'reason', header: 'Reason', width: '20%' },
    { key: 'amount', header: 'Amount', width: '9%' },
    { key: 'createdAt', header: 'Date', width: '8%' },
    { key: 'status', header: 'Status', type: 'badge', width: '6%' },
    { key: 'actions', header: 'Action', type: 'quickActions', width: '6%', sortable: false },
  ];

  override sortActive = 'createdAt';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.purchase.notes();
    const sum = (type: string) => list.filter(n => n.type === type).reduce((s, n) => s + n.amount, 0);
    return [
      { label: 'Total Notes', value: list.length, icon: 'bi-journal-text', iconVariant: 'primary' },
      { label: 'Open Notes', value: list.filter(n => n.status === 'Open').length, icon: 'bi-hourglass-split', iconVariant: 'orange' },
      { label: 'Debit Note Value', value: inr(sum('Debit Note')), icon: 'bi-arrow-up-right-circle', iconVariant: 'purple' },
      { label: 'Credit Note Value', value: inr(sum('Credit Note')), icon: 'bi-arrow-down-left-circle', iconVariant: 'blue' },
    ];
  });

  protected allRows(): TableRow[] {
    return this.purchase.notes().map(n => {
      const actions: QuickAction[] = n.status === 'Open'
        ? [{ key: 'adjust', icon: 'bi-check2-circle', label: 'Mark as adjusted', variant: 'primary' }]
        : [{ key: 'reopen', icon: 'bi-arrow-counterclockwise', label: 'Reopen' }];
      return {
        id: n.id,
        noteNo: n.noteNo,
        type: n.type,
        vendor: n.vendorName,
        poNo: n.poNo,
        grnNo: n.grnNo,
        reason: n.reason,
        amount: inr(n.amount),
        __amount: n.amount,
        createdAt: displayDate(n.createdAt),
        __createdAt: n.createdAt,
        status: n.status,
        actions,
      };
    });
  }

  async onQuickAction(event: { row: TableRow; action: string }): Promise<void> {
    const id = String(event.row['id']);
    if (event.action === 'reopen') {
      this.purchase.setNoteStatus(id, 'Open');
      return;
    }
    const ok = await this.toast.confirm('Mark note as adjusted?', `${event.row['noteNo']} will be settled against the vendor account.`, 'Yes, adjust');
    if (ok) this.purchase.setNoteStatus(id, 'Adjusted');
  }
}
