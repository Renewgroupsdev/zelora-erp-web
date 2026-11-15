import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { PurchaseDocument, PurchaseService } from '../../../../shared/common-services/purchase.service';
import { displayDate, inr, lineTotals, statusTone } from '../../../../shared/models/purchase.model';
import { CanActionDirective } from '../../../../shared/directives/can-action.directive';

export type PurchaseDocKind = 'request' | 'order' | 'inward' | 'return';

interface Fact { icon: string; label: string; value: string; tone?: string }
interface Column { key: string; label: string; num?: boolean }
interface Row { product: string; code: string; cells: Record<string, string>; flag?: 'bad' | 'warn' }
interface Total { label: string; value: string; strong?: boolean; minus?: boolean }
interface Note { icon: string; title: string; text: string; tone: 'info' | 'ok' | 'bad' | 'warn' }
interface Step { label: string; no: string | null; icon: string; current: boolean }

interface DocView {
  kind: PurchaseDocKind;
  no: string;
  kicker: string;
  icon: string;
  status: string;
  tone: string;
  title: string;
  subtitle: string;
  amountLabel: string;
  amount: string;
  facts: Fact[];
  columns: Column[];
  rows: Row[];
  totals: Total[];
  notes: Note[];
  journey: Step[];
  pdf: { doc: PurchaseDocument; id: string; permission: string } | null;
}

/**
 * Read-only "view" of a purchase document - request, purchase order, goods inward (GRN) or purchase return - in one design:
 * a hero with the status and amount, where the document sits in the purchase journey, the key facts, the product lines,
 * the totals and any notes (remarks, review, close / cancel reasons). Opened from the eye icon of each Purchase list.
 */
@Component({
  selector: 'app-purchase-doc-view',
  standalone: true,
  imports: [CanActionDirective, CommonModule, MatDialogModule],
  templateUrl: './purchase-doc-view.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './purchase-doc-view.scss'],
})
export class PurchaseDocView {
  private readonly dialogRef = inject(MatDialogRef<PurchaseDocView>);
  private readonly data = inject<{ kind: PurchaseDocKind; id: string }>(MAT_DIALOG_DATA);
  readonly purchase = inject(PurchaseService);

  readonly view = computed<DocView | null>(() => {
    switch (this.data.kind) {
      case 'request': return this.requestView();
      case 'order': return this.orderView();
      case 'inward': return this.inwardView();
      case 'return': return this.returnView();
    }
  });

  /** Position (1-4) of this document in the purchase journey. */
  readonly stepNo = computed(() => (this.view()?.journey.findIndex(s => s.current) ?? 0) + 1);

  private journey(current: PurchaseDocKind, nos: Partial<Record<PurchaseDocKind, string | null>>): Step[] {
    const steps: [PurchaseDocKind, string, string][] = [
      ['request', 'Request', 'bi-cart-plus'],
      ['order', 'Purchase Order', 'bi-receipt'],
      ['inward', 'Inward (GRN)', 'bi-box-arrow-in-down'],
      ['return', 'Return', 'bi-box-arrow-up'],
    ];
    return steps.map(([k, label, icon]) => ({ label, icon, no: nos[k] ?? null, current: k === current }));
  }

  private requestView(): DocView | null {
    const r = this.purchase.requests().find(x => x.id === this.data.id);
    if (!r) return null;
    const t = lineTotals(r.items);
    const po = r.poId ? this.purchase.orders().find(o => o.id === r.poId) : null;
    const notes: Note[] = [];
    if (r.remarks) notes.push({ icon: 'bi-chat-left-text', title: 'Requester remarks', text: r.remarks, tone: 'info' });
    if (r.reviewedBy) {
      notes.push({
        icon: r.status === 'Rejected' ? 'bi-x-octagon' : 'bi-patch-check', tone: r.status === 'Rejected' ? 'bad' : 'ok',
        title: `${r.status} by ${r.reviewedBy} · ${displayDate(r.reviewedAt)}`, text: r.reviewRemarks || 'No remarks.',
      });
    } else if (r.status === 'Pending') {
      notes.push({ icon: 'bi-hourglass-split', tone: 'warn', title: 'Waiting for head office approval', text: 'The head office chooses a vendor and approves it into a purchase order.' });
    }
    return {
      kind: 'request', no: r.requestNo, kicker: 'Purchase Request', icon: 'bi-cart-plus', status: r.status, tone: statusTone(r.status),
      title: r.branch, subtitle: r.vendorName && r.vendorName !== '-' ? r.vendorName : 'Vendor chosen at approval',
      amountLabel: 'Estimated total', amount: inr(t.grandTotal),
      facts: [
        { icon: 'bi-geo-alt', label: 'Branch', value: r.branch },
        { icon: 'bi-truck', label: 'Vendor', value: r.vendorName || '-' },
        { icon: 'bi-person', label: 'Requested by', value: r.requestedBy },
        { icon: 'bi-calendar-event', label: 'Requested on', value: displayDate(r.requestedAt) },
        { icon: 'bi-calendar-check', label: 'PO date', value: displayDate(r.requiredBy) },
        { icon: 'bi-flag', label: 'Priority', value: r.priority, tone: r.priority === 'Urgent' ? 'red' : r.priority === 'High' ? 'orange' : r.priority === 'Low' ? 'blue' : undefined },
      ],
      columns: [
        { key: 'hsn', label: 'HSN' }, { key: 'qty', label: 'Qty', num: true }, { key: 'price', label: 'Unit Price', num: true },
        { key: 'gst', label: 'GST', num: true }, { key: 'amount', label: 'Amount', num: true },
      ],
      rows: r.items.map(i => ({
        product: i.productName, code: i.productCode,
        cells: { hsn: i.hsnCode || '-', qty: String(i.requestedQty), price: inr(i.unitPrice), gst: `${i.gstPercent}%`, amount: inr(i.unitPrice * i.requestedQty * (1 + i.gstPercent / 100)) },
      })),
      totals: [{ label: 'Sub total', value: inr(t.subTotal) }, { label: 'GST', value: inr(t.gst) }, { label: 'Total', value: inr(t.grandTotal), strong: true }],
      notes,
      journey: this.journey('request', { request: r.requestNo, order: po?.poNo ?? (r.poId ? 'Raised' : null) }),
      pdf: { doc: 'purchase-request', id: r.id, permission: 'download-purchase-request' },
    };
  }

  private orderView(): DocView | null {
    const o = this.purchase.orders().find(x => x.id === this.data.id);
    if (!o) return null;
    const t = lineTotals(o.items);
    const ordered = o.items.reduce((s, i) => s + i.requestedQty, 0);
    const received = o.items.reduce((s, i) => s + i.receivedQty, 0);
    const pending = o.items.reduce((s, i) => s + (i.pendingQty ?? 0), 0);
    const grns = this.purchase.inwards().filter(g => g.poId === o.id && g.status !== 'Cancelled').map(g => g.grnNo);
    const notes: Note[] = [];
    if (o.closeReason) {
      notes.push({ icon: o.status === 'Cancelled' ? 'bi-x-octagon' : 'bi-slash-circle', tone: 'bad',
        title: `${o.status} by ${o.closedBy || '-'} · ${displayDate(o.closedAt)}`, text: o.closeReason });
    }
    if (o.source === 'low_stock') notes.push({ icon: 'bi-box-seam', tone: 'info', title: 'Low stock replenishment', text: 'Raised for the Central Store from Low Stock Replenishment.' });
    return {
      kind: 'order', no: o.poNo, kicker: 'Purchase Order', icon: 'bi-receipt', status: o.status, tone: statusTone(o.status),
      title: o.vendorName, subtitle: `${o.branch} · invoice ${o.invoiceNo}`,
      amountLabel: 'Order total', amount: inr(t.grandTotal),
      facts: [
        { icon: 'bi-truck', label: 'Vendor', value: o.vendorName },
        { icon: 'bi-geo-alt', label: 'Branch', value: o.branch },
        { icon: 'bi-receipt-cutoff', label: 'Invoice no', value: o.invoiceNo },
        { icon: 'bi-calendar-event', label: 'PO date', value: displayDate(o.orderedAt) },
        { icon: 'bi-calendar-check', label: 'Expected', value: displayDate(o.expectedAt) },
        { icon: 'bi-person-check', label: 'Approved by', value: o.approvedBy || '-' },
        { icon: 'bi-box-seam', label: 'Ordered / received / pending', value: `${ordered} / ${received} / ${pending}`, tone: pending ? 'orange' : 'green' },
      ],
      columns: [
        { key: 'batch', label: 'Batch' }, { key: 'ordered', label: 'Ordered', num: true }, { key: 'received', label: 'Received', num: true },
        { key: 'pending', label: 'Pending', num: true }, { key: 'price', label: 'Unit Price', num: true }, { key: 'gst', label: 'GST', num: true },
        { key: 'amount', label: 'Amount', num: true },
      ],
      rows: o.items.map(i => ({
        product: i.productName, code: i.productCode, flag: (i.pendingQty ?? 0) > 0 && o.status !== 'Ordered' ? 'warn' : undefined,
        cells: {
          batch: i.batchNo || '-', ordered: String(i.requestedQty), received: String(i.receivedQty), pending: String(i.pendingQty ?? 0),
          price: inr(i.unitPrice), gst: `${i.gstPercent}%`, amount: inr(i.unitPrice * i.requestedQty * (1 + i.gstPercent / 100)),
        },
      })),
      totals: [{ label: 'Sub total', value: inr(t.subTotal) }, { label: 'GST', value: inr(t.gst) }, { label: 'Total', value: inr(t.grandTotal), strong: true }],
      notes,
      journey: this.journey('order', { request: o.requestNo || (o.source === 'low_stock' ? 'Low stock' : null), order: o.poNo, inward: grns.length ? grns.join(', ') : null }),
      pdf: { doc: 'purchase-order', id: o.id, permission: 'download-purchase-order' },
    };
  }

  private inwardView(): DocView | null {
    const g = this.purchase.inwards().find(x => x.id === this.data.id);
    if (!g) return null;
    const items = g.lines.reduce((s, l) => s + l.lineTotal, 0);
    const received = g.lines.reduce((s, l) => s + l.receivedQty, 0);
    const damaged = g.lines.reduce((s, l) => s + l.damagedQty, 0);
    const free = g.lines.reduce((s, l) => s + l.freeQty, 0);
    const status = g.status === 'Cancelled' ? 'Cancelled' : g.isPartial ? 'Partial receipt' : 'Full receipt';
    const order = this.purchase.orders().find(o => o.id === g.poId);
    const returns = this.purchase.returns().filter(r => r.grnId === g.id && r.status !== 'Cancelled').map(r => r.returnNo);
    const notes: Note[] = [];
    if (g.remarks) notes.push({ icon: 'bi-chat-left-text', tone: 'info', title: 'Remarks', text: g.remarks });
    if (g.noteNo) notes.push({ icon: 'bi-journal-text', tone: 'warn', title: `Vendor note ${g.noteNo}`, text: 'Raised for damaged, short-supplied or rate-difference items.' });
    if (g.cancelReason) notes.push({ icon: 'bi-x-octagon', tone: 'bad', title: 'Cancelled', text: g.cancelReason });
    const totals: Total[] = [{ label: 'Items (incl. GST)', value: inr(items) }];
    if (g.freight) totals.push({ label: 'Freight', value: inr(g.freight) });
    if (g.otherCharges) totals.push({ label: 'Other charges', value: inr(g.otherCharges) });
    if (g.cashDiscount) totals.push({ label: 'Cash discount', value: inr(g.cashDiscount), minus: true });
    if (g.roundOff) totals.push({ label: 'Round off', value: inr(g.roundOff) });
    totals.push({ label: 'Net bill amount', value: inr(g.netAmount), strong: true });
    return {
      kind: 'inward', no: g.grnNo, kicker: 'Goods Inward (GRN)', icon: 'bi-box-arrow-in-down', status,
      tone: g.status === 'Cancelled' ? 'red' : g.isPartial ? 'orange' : 'green',
      title: g.vendorName, subtitle: `Received into ${g.store} · against ${g.poNo}`,
      amountLabel: 'Net bill amount', amount: inr(g.netAmount),
      facts: [
        { icon: 'bi-truck', label: 'Vendor', value: g.vendorName },
        { icon: 'bi-building', label: 'Received into', value: g.store },
        { icon: 'bi-receipt', label: 'Bill no', value: g.vendorInvoiceNo || '-' },
        { icon: 'bi-calendar3', label: 'Bill date', value: displayDate(g.billDate) },
        { icon: 'bi-person', label: 'Received by', value: g.receivedBy || '-' },
        { icon: 'bi-calendar-check', label: 'Received on', value: displayDate(g.receivedAt) },
        { icon: 'bi-box-seam', label: 'Received / damaged / free', value: `${received} / ${damaged} / ${free}`, tone: damaged ? 'red' : 'green' },
      ],
      columns: [
        { key: 'batch', label: 'Batch' }, { key: 'mfg', label: 'MFG' }, { key: 'exp', label: 'Expiry' },
        { key: 'recv', label: 'Recv', num: true }, { key: 'dmg', label: 'Dmg', num: true }, { key: 'free', label: 'Free', num: true },
        { key: 'rate', label: 'Rate', num: true }, { key: 'disc', label: 'Disc', num: true }, { key: 'total', label: 'Total', num: true },
      ],
      rows: g.lines.map(l => ({
        product: l.productName, code: l.productCode || '', flag: l.damagedQty > 0 ? 'bad' : undefined,
        cells: {
          batch: l.batchNo || '-', mfg: displayDate(l.mfgDate), exp: displayDate(l.expiryDate), recv: String(l.receivedQty),
          dmg: String(l.damagedQty), free: String(l.freeQty), rate: inr(l.unitPrice), disc: `${l.discountPercent || 0}%`, total: inr(l.lineTotal),
        },
      })),
      totals, notes,
      journey: this.journey('inward', { request: order?.requestNo || null, order: g.poNo, inward: g.grnNo, return: returns.length ? returns.join(', ') : null }),
      pdf: { doc: 'goods-inward', id: g.id, permission: 'download-goods-inward' },
    };
  }

  private returnView(): DocView | null {
    const r = this.purchase.returns().find(x => x.id === this.data.id);
    if (!r) return null;
    const qty = r.lines.reduce((s, l) => s + l.qty, 0);
    const value = r.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const notes: Note[] = [];
    if (r.remarks) notes.push({ icon: 'bi-chat-left-text', tone: 'info', title: 'Remarks', text: r.remarks });
    notes.push(r.returnType === 'Replacement'
      ? { icon: 'bi-arrow-repeat', tone: 'info', title: 'Replacement', text: `The returned qty is re-opened on ${r.poNo} and comes back from ${r.vendorName} on a later inward.` }
      : { icon: 'bi-receipt-cutoff', tone: 'warn', title: r.noteNo ? `Debit note ${r.noteNo}` : 'Debit note', text: r.noteNo ? `Raised on ${r.vendorName} for the return value.` : 'No debit note was raised for this return.' });
    if (r.cancelReason) notes.push({ icon: 'bi-x-octagon', tone: 'bad', title: 'Cancelled', text: r.cancelReason });
    const order = this.purchase.orders().find(o => o.poNo === r.poNo);
    return {
      kind: 'return', no: r.returnNo, kicker: 'Purchase Return', icon: 'bi-box-arrow-up', status: r.status, tone: statusTone(r.status),
      title: r.vendorName, subtitle: `Returned from ${r.store} · ${r.reason}`,
      amountLabel: 'Return value', amount: inr(value),
      facts: [
        { icon: 'bi-truck', label: 'Vendor', value: r.vendorName },
        { icon: 'bi-building', label: 'Returned from', value: r.store },
        { icon: 'bi-flag', label: 'Reason', value: r.reason, tone: 'red' },
        { icon: 'bi-arrow-repeat', label: 'Return type', value: r.returnType },
        { icon: 'bi-person', label: 'Returned by', value: r.returnedBy || '-' },
        { icon: 'bi-calendar-check', label: 'Returned on', value: displayDate(r.returnedAt) },
        { icon: 'bi-box-seam', label: 'Return qty', value: String(qty) },
      ],
      columns: [{ key: 'batch', label: 'Batch' }, { key: 'qty', label: 'Qty', num: true }, { key: 'price', label: 'Unit Price', num: true }, { key: 'value', label: 'Value', num: true }],
      rows: r.lines.map(l => ({ product: l.productName, code: '', cells: { batch: l.batchNo, qty: String(l.qty), price: inr(l.unitPrice), value: inr(l.qty * l.unitPrice) } })),
      totals: [{ label: 'Return qty', value: String(qty) }, { label: 'Return value', value: inr(value), strong: true }],
      notes,
      journey: this.journey('return', { request: order?.requestNo || null, order: r.poNo, inward: r.grnNo, return: r.returnNo }),
      pdf: { doc: 'purchase-return', id: r.id, permission: 'download-purchase-return' },
    };
  }

  openPdf(): void {
    const v = this.view();
    if (v?.pdf) void this.purchase.openPdf(v.pdf.doc, v.pdf.id);
  }

  close(): void {
    this.dialogRef.close();
  }
}
