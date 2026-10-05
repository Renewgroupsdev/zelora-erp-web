import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { CommonDetailCard } from '../../../../shared/components/common-detail-card/common-detail-card';
import { CommonFilterCard } from '../../../../shared/components/common-filter-card/common-filter-card';
import { CommonTableCard } from '../../../../shared/components/common-table-card/common-table-card';
import { DetailCardData, FilterOption, TableColumn, TableRow } from '../../../../shared/models/common-components.model';
import { PURCHASE_RETURN_REASONS, displayDate, inr } from '../../../../shared/models/purchase.model';
import { PurchaseListBase } from '../purchase-list-base';
import { PurchaseTabs } from '../purchase-tabs/purchase-tabs';
import { PurchaseReturnForm } from './purchase-return-form/purchase-return-form';

/** Stock sent back to the vendor against a purchase inward (GRN). Each return reduces store stock and can raise a debit note. */
@Component({
  selector: 'app-purchase-returns',
  standalone: true,
  imports: [CommonModule, MatDialogModule, CommonDetailCard, CommonFilterCard, CommonTableCard, PurchaseTabs],
  templateUrl: './purchase-returns.html',
  styleUrl: '../../../../shared/styles/erp-page.scss',
})
export class PurchaseReturns extends PurchaseListBase {
  protected readonly noun = 'returns';
  protected override filterFields = { status: 'reason', source: 'vendor', branch: ['store'] };

  readonly returnFilters = computed<FilterOption[]>(() => [
    { key: 'status', label: 'Reason', options: [...PURCHASE_RETURN_REASONS] },
    { key: 'source', label: 'Vendor', options: [...new Set(this.purchase.returns().map(r => r.vendorName))] },
    { key: 'branch', label: 'Store', options: this.purchase.stores, multiSelect: true },
  ]);

  columns: TableColumn[] = [
    { key: 'returnNo', header: 'Return No', width: '10%' },
    { key: 'grnNo', header: 'GRN No', width: '10%' },
    { key: 'poNo', header: 'PO No', width: '10%' },
    { key: 'vendor', header: 'Vendor', width: '13%' },
    { key: 'store', header: 'Returned From', type: 'branch', width: '10%' },
    { key: 'items', header: 'Product · Batch', width: '15%' },
    { key: 'qty', header: 'Qty', width: '5%' },
    { key: 'value', header: 'Value', width: '8%' },
    { key: 'reason', header: 'Reason', type: 'badge', width: '10%' },
    { key: 'noteNo', header: 'Debit Note', width: '8%' },
    { key: 'returnedAt', header: 'Date', width: '8%' },
  ];

  override sortActive = 'returnedAt';

  readonly stats = computed<DetailCardData[]>(() => {
    const list = this.purchase.returns();
    const lines = list.flatMap(r => r.lines);
    const noteIds = new Set(list.map(r => r.noteId).filter(Boolean));
    return [
      { label: 'Purchase Returns', value: list.length, icon: 'bi-box-arrow-up', iconVariant: 'primary' },
      { label: 'Units Returned', value: lines.reduce((s, l) => s + l.qty, 0), icon: 'bi-boxes', iconVariant: 'blue' },
      { label: 'Return Value', value: inr(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)), icon: 'bi-currency-rupee', iconVariant: 'purple' },
      { label: 'Open Debit Notes', value: this.purchase.notes().filter(n => noteIds.has(n.id) && n.status === 'Open').length, icon: 'bi-journal-text', iconVariant: 'orange' },
    ];
  });

  protected allRows(): TableRow[] {
    const notes = this.purchase.notes();
    return this.purchase.returns().map(r => {
      const qty = r.lines.reduce((s, l) => s + l.qty, 0);
      const value = r.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
      return {
        id: r.id,
        returnNo: r.returnNo,
        grnNo: r.grnNo,
        poNo: r.poNo,
        vendor: r.vendorName,
        store: r.store,
        items: r.lines.map(l => `${l.productName} · ${l.batchNo}`).join(', '),
        qty: String(qty), __qty: qty,
        value: inr(value), __value: value,
        reason: r.reason,
        noteNo: notes.find(n => n.id === r.noteId)?.noteNo ?? '-',
        returnedAt: displayDate(r.returnedAt),
        __returnedAt: r.returnedAt,
        __date: r.returnedAt,
        searchText: `${r.returnNo} ${r.grnNo} ${r.poNo} ${r.vendorName} ${r.remarks} ${r.lines.map(l => `${l.productName} ${l.batchNo}`).join(' ')}`,
      };
    });
  }

  newReturn(): void {
    if (!this.purchase.returnableInwards().length) {
      Swal.fire({ icon: 'info', title: 'Nothing to return', text: 'No purchase inward has stock left that can be returned to the vendor.', confirmButtonColor: '#6C63FF' });
      return;
    }
    this.openDialog(PurchaseReturnForm, {}, '980px');
  }
}
