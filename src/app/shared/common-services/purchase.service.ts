import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/auth/auth.service';
import { isTelecallerRole } from '../../core/auth/auth.model';
import {
  CENTRAL_STORE,
  GoodsInward,
  InwardLine,
  LOW_STOCK_THRESHOLD,
  PurchaseLineItem,
  PurchaseOption,
  PurchaseOrder,
  PurchaseRequest,
  PurchaseReturn,
  PurchaseReturnLine,
  PurchaseReturnReason,
  StockBatch,
  StockTransfer,
  VendorNote,
  VendorNoteType,
  Priority,
} from '../models/purchase.model';
import { InventoryService } from './inventory.service';
import { NotificationService } from './notification.service';

const STORAGE_KEY = 'zelora_purchase_store_v1';

interface PurchaseState {
  requests: PurchaseRequest[];
  orders: PurchaseOrder[];
  inwards: GoodsInward[];
  returns: PurchaseReturn[];
  notes: VendorNote[];
  stock: StockBatch[];
  transfers: StockTransfer[];
}

export interface NewRequestInput {
  branch: string;
  vendorId: number | null;
  vendorName: string;
  requiredBy: string | null;
  priority: Priority;
  remarks: string;
  items: Omit<PurchaseLineItem, 'receivedQty'>[];
}

export interface InwardInput {
  poId: string;
  store: string;
  vendorInvoiceNo: string;
  lines: InwardLine[];
  note: { type: VendorNoteType; reason: string } | null;
}

export interface ReturnInput {
  grnId: string;
  reason: PurchaseReturnReason;
  remarks: string;
  lines: { productId: string; batchNo: string; qty: number }[];
  raiseNote: boolean;
}

/** One GRN batch line with how much of it can still go back to the vendor. */
export interface ReturnableLine {
  productId: string;
  productName: string;
  batchNo: string;
  unitPrice: number;
  accepted: number;
  returned: number;
  inStock: number;
  /** min(accepted - already returned, qty still on hand in the GRN's store). */
  returnable: number;
}

/**
 * Front-end store for the Purchase Management flow (design stage - no API yet).
 * State lives in signals and is mirrored to localStorage so the flow survives a reload;
 * swap each mutator for an API call once the backend endpoints exist.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseService {
  private readonly auth = inject(AuthService);
  private readonly inventory = inject(InventoryService);
  private readonly notifications = inject(NotificationService);

  private readonly state = signal<PurchaseState>(this.load());

  readonly requests = computed(() => this.state().requests);
  readonly orders = computed(() => this.state().orders);
  readonly inwards = computed(() => this.state().inwards);
  readonly returns = computed(() => this.state().returns);
  readonly notes = computed(() => this.state().notes);
  readonly stock = computed(() => this.state().stock);
  readonly transfers = computed(() => this.state().transfers);

  readonly branches = ['Anna Nagar', 'Velachery', 'T. Nagar', 'Adyar'];
  readonly stores = [CENTRAL_STORE, ...this.branches];

  /** Branch heads / managers / admins approve requests; telecallers and staff only raise them. */
  readonly canApprove = computed(() => !isTelecallerRole(this.auth.currentUser()));
  readonly pendingCount = computed(() => this.requests().filter(r => r.status === 'Pending').length);

  /** Per store + product totals under the threshold. */
  readonly lowStock = computed(() => {
    const totals = new Map<string, { store: string; productName: string; qty: number }>();
    for (const b of this.stock()) {
      const key = `${b.store}|${b.productId}`;
      const row = totals.get(key) ?? { store: b.store, productName: b.productName, qty: 0 };
      row.qty += b.qty;
      totals.set(key, row);
    }
    return [...totals.values()].filter(t => t.qty < LOW_STOCK_THRESHOLD);
  });

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
      } catch { /* storage full / blocked - state still works in memory */ }
    });
  }

  get userName(): string {
    return this.auth.currentUser()?.name || 'Staff';
  }

  /** Active products from the product master; falls back to demo items when the API is unavailable. */
  productOptions(): Observable<PurchaseOption[]> {
    return this.inventory.listProducts({ page: 1, perPage: 100, status: 'Active' }).pipe(
      map((res: any) => ((res?.data ?? []) as any[]).map(p => ({
        id: String(p.id),
        code: p.code,
        name: p.name,
        vendorId: p.vendor_id ?? null,
        unitPrice: Number(p.purchase_price) || 0,
        gstPercent: Number(p.gst_percent) || 0,
      }))),
      map(list => (list.length ? list : DEMO_PRODUCTS)),
      catchError(() => of(DEMO_PRODUCTS)),
    );
  }

  vendorOptions(): Observable<{ id: number; name: string }[]> {
    return this.inventory.vendorOptions().pipe(map(list => (list.length ? list : DEMO_VENDORS)));
  }

  // ---- Purchase requests ----
  createRequest(input: NewRequestInput): PurchaseRequest {
    const request: PurchaseRequest = {
      id: uid('PR'),
      requestNo: this.nextNo('PR', this.requests().length),
      requestedBy: this.userName,
      requestedAt: new Date().toISOString(),
      status: 'Pending',
      ...input,
      items: input.items.map(i => ({ ...i, receivedQty: 0 })),
    };
    this.patch({ requests: [request, ...this.requests()] });

    this.alert('purchase', 'Purchase request sent', `${request.requestNo} from ${request.branch} is waiting for branch head approval.`, '/app/inventory/purchase-requests');
    return request;
  }

  approveRequest(id: string, remarks: string, expectedAt: string | null): PurchaseOrder | null {
    const request = this.requests().find(r => r.id === id);
    if (!request || request.status !== 'Pending') return null;

    const seq = this.orders().length;
    const poNo = this.nextNo('PO', seq);
    const taken = this.usedBatchNos();
    const order: PurchaseOrder = {
      id: uid('PO'),
      poNo,
      invoiceNo: this.nextNo('INV', seq),
      requestId: request.id,
      requestNo: request.requestNo,
      branch: request.branch,
      vendorId: request.vendorId,
      vendorName: request.vendorName,
      orderedAt: new Date().toISOString(),
      approvedBy: this.userName,
      expectedAt,
      // Batch no is generated once here, at approval, and carried into every inward of this PO.
      items: request.items.map((i, index) => ({ ...i, receivedQty: 0, batchNo: this.generateBatchNo(poNo, index, taken) })),
      status: 'Ordered',
    };

    this.patch({
      orders: [order, ...this.orders()],
      requests: this.requests().map(r => r.id === id
        ? { ...r, status: 'Approved', reviewedBy: this.userName, reviewedAt: new Date().toISOString(), reviewRemarks: remarks, poId: order.id }
        : r),
    });

    this.notifications.add({ type: 'manager', title: 'Purchase order confirmed', message: `${order.poNo} raised to ${order.vendorName} for ${request.requestNo}.`, link: '/app/inventory/purchase-orders' });
    return order;
  }

  rejectRequest(id: string, remarks: string): void {
    this.patch({
      requests: this.requests().map(r => r.id === id
        ? { ...r, status: 'Rejected', reviewedBy: this.userName, reviewedAt: new Date().toISOString(), reviewRemarks: remarks }
        : r),
    });
  }

  // ---- Purchase inward (GRN) ----
  recordInward(input: InwardInput): GoodsInward | null {
    const order = this.orders().find(o => o.id === input.poId);
    if (!order || order.status === 'Received') return null;

    // Same rules as the reference purchase inward: qty > 0, damaged <= received, one product + batch per entry.
    const seen = new Set<string>();
    const taken = this.inwards().filter(g => g.poId === order.id).flatMap(g => g.lines.map(l => l.batchNo));
    const lines: InwardLine[] = [];
    for (const raw of input.lines) {
      const receivedQty = Math.trunc(Number(raw.receivedQty) || 0);
      const damagedQty = Math.trunc(Number(raw.damagedQty) || 0);
      if (receivedQty <= 0 || damagedQty < 0 || damagedQty > receivedQty) continue;
      const batchNo = (raw.batchNo || '').trim().toUpperCase() || this.nextInwardBatchNo(order.id, raw.productId, taken);
      const key = `${raw.productId}|${batchNo}`;
      if (seen.has(key)) return null;
      seen.add(key);
      taken.push(batchNo);
      lines.push({ ...raw, batchNo, receivedQty, damagedQty });
    }
    if (!lines.length) return null;
    input = { ...input, lines };

    const accepted = (l: InwardLine) => Math.max(0, l.receivedQty - l.damagedQty);
    const items = order.items.map(item => {
      const qty = input.lines.filter(l => l.productId === item.productId).reduce((s, l) => s + accepted(l), 0);
      return { ...item, receivedQty: Math.min(item.requestedQty, item.receivedQty + qty) };
    });
    const fullyReceived = items.every(i => i.receivedQty >= i.requestedQty);
    const grnNo = this.nextNo('GRN', this.inwards().length);

    let note: VendorNote | undefined;
    if (input.note) {
      const shortValue = items.reduce((s, i) => s + (i.requestedQty - i.receivedQty) * i.unitPrice, 0);
      const damagedValue = input.lines.reduce((s, l) => s + l.damagedQty * l.unitPrice, 0);
      note = {
        id: uid('NT'),
        noteNo: this.nextNo(input.note.type === 'Credit Note' ? 'CN' : 'DN', this.notes().length),
        type: input.note.type,
        vendorName: order.vendorName,
        poNo: order.poNo,
        grnNo,
        reason: input.note.reason,
        amount: damagedValue + (fullyReceived ? 0 : shortValue),
        createdAt: new Date().toISOString(),
        status: 'Open',
      };
    }

    const inward: GoodsInward = {
      id: uid('GRN'),
      grnNo,
      poId: order.id,
      poNo: order.poNo,
      vendorName: order.vendorName,
      store: input.store,
      receivedBy: this.userName,
      receivedAt: new Date().toISOString(),
      vendorInvoiceNo: input.vendorInvoiceNo,
      lines: input.lines,
      isPartial: !fullyReceived,
      noteId: note?.id,
    };

    let stock = [...this.stock()];
    for (const line of input.lines) {
      const qty = accepted(line);
      if (!qty) continue;
      const item = order.items.find(i => i.productId === line.productId);
      const existing = stock.find(b => b.store === input.store && b.productId === line.productId && b.batchNo === line.batchNo);
      if (existing) {
        stock = stock.map(b => (b.id === existing.id ? { ...b, qty: b.qty + qty } : b));
        continue;
      }
      stock.push({
        id: uid('STK'),
        store: input.store,
        productId: line.productId,
        productCode: item?.productCode ?? '',
        productName: line.productName,
        batchNo: line.batchNo,
        expiryDate: line.expiryDate,
        qty,
        unitPrice: line.unitPrice,
      });
    }

    this.patch({
      inwards: [inward, ...this.inwards()],
      notes: note ? [note, ...this.notes()] : this.notes(),
      stock,
      orders: this.orders().map(o => o.id === order.id ? { ...o, items, status: fullyReceived ? 'Received' : 'Partially Received' } : o),
    });

    this.notifications.add({ type: 'stock', title: fullyReceived ? 'Goods received' : 'Partial goods received', message: `${grnNo} posted to ${input.store} against ${order.poNo}.`, link: '/app/inventory/purchase-inward' });
    this.checkLowStock(input.store, input.lines.map(l => l.productId));
    return inward;
  }

  // ---- Purchase return (back to vendor) ----
  returnableLines(grnId: string): ReturnableLine[] {
    const inward = this.inwards().find(g => g.id === grnId);
    if (!inward) return [];
    const returnedLines = this.returns().filter(r => r.grnId === grnId).flatMap(r => r.lines);

    return inward.lines.map(l => {
      const accepted = Math.max(0, l.receivedQty - l.damagedQty);
      const returned = returnedLines.filter(r => r.productId === l.productId && r.batchNo === l.batchNo).reduce((s, r) => s + r.qty, 0);
      const inStock = this.stock().filter(b => b.store === inward.store && b.productId === l.productId && b.batchNo === l.batchNo).reduce((s, b) => s + b.qty, 0);
      return {
        productId: l.productId,
        productName: l.productName,
        batchNo: l.batchNo,
        unitPrice: l.unitPrice,
        accepted,
        returned,
        inStock,
        returnable: Math.max(0, Math.min(accepted - returned, inStock)),
      };
    });
  }

  /** GRNs that still have at least one unit that can be returned. */
  readonly returnableInwards = computed(() => this.inwards().filter(g => this.returnableLines(g.id).some(l => l.returnable > 0)));

  recordReturn(input: ReturnInput): PurchaseReturn | null {
    const inward = this.inwards().find(g => g.id === input.grnId);
    if (!inward || !input.reason) return null;

    const available = this.returnableLines(inward.id);
    const lines: PurchaseReturnLine[] = [];
    for (const raw of input.lines) {
      const qty = Number(raw.qty) || 0;
      if (!qty) continue;
      const line = available.find(l => l.productId === raw.productId && l.batchNo === raw.batchNo);
      // Whole qty > 0 and never more than was accepted (minus earlier returns) or is still on hand.
      if (!line || !Number.isInteger(qty) || qty < 0 || qty > line.returnable) return null;
      lines.push({ productId: line.productId, productName: line.productName, batchNo: line.batchNo, qty, unitPrice: line.unitPrice });
    }
    if (!lines.length) return null;

    const returnNo = this.nextNo('PRN', this.returns().length);
    const amount = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

    let note: VendorNote | undefined;
    if (input.raiseNote) {
      note = {
        id: uid('NT'),
        noteNo: this.nextNo('DN', this.notes().length),
        type: 'Debit Note',
        vendorName: inward.vendorName,
        poNo: inward.poNo,
        grnNo: inward.grnNo,
        returnNo,
        reason: `Purchase return ${returnNo}: ${input.reason}${input.remarks ? ' - ' + input.remarks : ''}`,
        amount,
        createdAt: new Date().toISOString(),
        status: 'Open',
      };
    }

    const purchaseReturn: PurchaseReturn = {
      id: uid('PRN'),
      returnNo,
      grnId: inward.id,
      grnNo: inward.grnNo,
      poNo: inward.poNo,
      vendorName: inward.vendorName,
      store: inward.store,
      reason: input.reason,
      remarks: input.remarks,
      lines,
      returnedBy: this.userName,
      returnedAt: new Date().toISOString(),
      noteId: note?.id,
    };

    // Take the returned qty out of the GRN's store, batch by batch.
    let stock = [...this.stock()];
    for (const line of lines) {
      let left = line.qty;
      stock = stock.map(b => {
        if (!left || b.store !== inward.store || b.productId !== line.productId || b.batchNo !== line.batchNo) return b;
        const take = Math.min(left, b.qty);
        left -= take;
        return { ...b, qty: b.qty - take };
      });
    }

    this.patch({
      returns: [purchaseReturn, ...this.returns()],
      notes: note ? [note, ...this.notes()] : this.notes(),
      stock: stock.filter(b => b.qty > 0 || b.store === CENTRAL_STORE),
    });

    this.notifications.add({ type: 'stock', title: 'Purchase return posted', message: `${returnNo} returned to ${inward.vendorName} from ${inward.store} against ${inward.grnNo}.`, link: '/app/inventory/purchase-returns' });
    this.checkLowStock(inward.store, lines.map(l => l.productId));
    return purchaseReturn;
  }

  setNoteStatus(id: string, status: VendorNote['status']): void {
    this.patch({ notes: this.notes().map(n => (n.id === id ? { ...n, status } : n)) });
  }

  // ---- Stock transfer (central store -> branch) ----
  transferStock(batchId: string, toStore: string, qty: number, remarks: string): StockTransfer | null {
    const batch = this.stock().find(b => b.id === batchId);
    qty = Number(qty);
    // Reference transfer rules: valid target store, whole qty > 0 and not more than the batch has on hand.
    if (!batch || !toStore || toStore === batch.store || !this.stores.includes(toStore)) return null;
    if (!Number.isInteger(qty) || qty <= 0 || qty > batch.qty) return null;

    // Same product + batch at the target is topped up, otherwise a new batch row is opened there (immutable update).
    let stock = this.stock().map(b => (b.id === batchId ? { ...b, qty: b.qty - qty } : b));
    const existing = stock.find(b => b.store === toStore && b.productId === batch.productId && b.batchNo === batch.batchNo);
    if (existing) stock = stock.map(b => (b.id === existing.id ? { ...b, qty: b.qty + qty } : b));
    else stock.push({ ...batch, id: uid('STK'), store: toStore, qty });

    const transfer: StockTransfer = {
      id: uid('TR'),
      transferNo: this.nextNo('ST', this.transfers().length),
      fromStore: batch.store,
      toStore,
      productName: batch.productName,
      batchNo: batch.batchNo,
      qty,
      transferredBy: this.userName,
      transferredAt: new Date().toISOString(),
      remarks,
    };

    this.patch({ stock: stock.filter(b => b.qty > 0 || b.store === CENTRAL_STORE), transfers: [transfer, ...this.transfers()] });
    this.checkLowStock(batch.store, [batch.productId]);
    return transfer;
  }

  storeQty(store: string, productId: string): number {
    return this.stock().filter(b => b.store === store && b.productId === productId).reduce((s, b) => s + b.qty, 0);
  }

  /** Stock batches of a store with qty on hand, earliest expiry first (FEFO) - the order transfers should pick from. */
  availableBatches(store: string) {
    return this.stock()
      .filter(b => b.store === store && b.qty > 0)
      .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999') || a.batchNo.localeCompare(b.batchNo));
  }

  /**
   * Batch no for the next inward row of a PO product. The first receipt uses the batch generated at PO approval;
   * any further batch (split row or a later partial GRN) gets the next suffix, e.g. B-2026-0001-01-2.
   */
  nextInwardBatchNo(orderId: string, productId: string, takenInForm: string[] = []): string {
    const order = this.orders().find(o => o.id === orderId);
    const index = order ? order.items.findIndex(i => i.productId === productId) : -1;
    const base = (order && index >= 0 && order.items[index].batchNo) || this.generateBatchNo(order?.poNo ?? this.nextNo('PO', this.orders().length), Math.max(index, 0), this.usedBatchNos());
    const used = new Set([
      ...this.inwards().filter(g => g.poId === orderId).flatMap(g => g.lines.map(l => l.batchNo)),
      ...takenInForm,
    ].map(b => (b || '').trim().toUpperCase()));
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  /** B-<year>-<PO seq>-<line>, e.g. PO-2026-0007 line 2 -> B-2026-0007-02; bumped if it already exists anywhere. */
  private generateBatchNo(poNo: string, lineIndex: number, taken: string[]): string {
    const base = `B-${poNo.replace(/^PO-/, '')}-${String(lineIndex + 1).padStart(2, '0')}`;
    let batchNo = base;
    let n = 2;
    while (taken.includes(batchNo)) batchNo = `${base}-${n++}`;
    taken.push(batchNo);
    return batchNo;
  }

  private usedBatchNos(): string[] {
    const s = this.state();
    return [
      ...s.orders.flatMap(o => o.items.map(i => i.batchNo ?? '')),
      ...s.inwards.flatMap(g => g.lines.map(l => l.batchNo)),
      ...s.stock.map(b => b.batchNo),
    ].filter(Boolean);
  }

  /** Raises a bell notification + popup to the branch head for every product that dropped under the threshold. */
  private checkLowStock(store: string, productIds: string[]): void {
    for (const productId of new Set(productIds)) {
      const qty = this.storeQty(store, productId);
      if (qty >= LOW_STOCK_THRESHOLD) continue;
      const name = this.stock().find(b => b.productId === productId)?.productName ?? 'Product';
      this.alert('stock', 'Low stock alert', `${name} is running low at ${store} (${qty} units left). Branch head notified.`, '/app/inventory/stock', 'warning');
    }
  }

  private alert(type: 'purchase' | 'stock', title: string, message: string, link: string, icon: 'info' | 'warning' = 'info'): void {
    this.notifications.add({ type, title, message, link });
    Swal.fire({ toast: true, position: 'top-end', icon, title, text: message, showConfirmButton: false, timer: 4500, timerProgressBar: true });
  }

  private patch(partial: Partial<PurchaseState>): void {
    this.state.update(s => ({ ...s, ...partial }));
  }

  private nextNo(prefix: string, count: number): string {
    return `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  }

  private load(): PurchaseState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return withPoBatchNos(JSON.parse(raw) as PurchaseState);
    } catch { /* fall through to seed */ }
    return seedState();
  }
}

/** POs stored before batch numbers were generated on approval get one per line (B-<year>-<seq>-<line>). */
function withPoBatchNos(state: PurchaseState): PurchaseState {
  return {
    ...state,
    returns: state.returns ?? [],
    orders: (state.orders ?? []).map(o => ({
      ...o,
      items: o.items.map((i, index) => (i.batchNo ? i : { ...i, batchNo: `B-${o.poNo.replace(/^PO-/, '')}-${String(index + 1).padStart(2, '0')}` })),
    })),
  };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const DEMO_VENDORS = [
  { id: 1, name: 'Derma Supplies Pvt Ltd' },
  { id: 2, name: 'Hair Care Distributors' },
];

const DEMO_PRODUCTS: PurchaseOption[] = [
  { id: 'demo-1', code: 'PRD-001', name: 'Hyaluronic Acid Serum', vendorId: 1, unitPrice: 450, gstPercent: 18 },
  { id: 'demo-2', code: 'PRD-002', name: 'Vitamin C Face Wash', vendorId: 1, unitPrice: 220, gstPercent: 18 },
  { id: 'demo-3', code: 'PRD-003', name: 'Minoxidil 5% Solution', vendorId: 2, unitPrice: 610, gstPercent: 12 },
  { id: 'demo-4', code: 'PRD-004', name: 'Biotin Hair Shampoo', vendorId: 2, unitPrice: 330, gstPercent: 18 },
];

function seedState(): PurchaseState {
  const day = 24 * 60 * 60 * 1000;
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
  const item = (p: PurchaseOption, requestedQty: number, receivedQty = 0): PurchaseLineItem => ({
    productId: p.id, productCode: p.code, productName: p.name, unitPrice: p.unitPrice, gstPercent: p.gstPercent, requestedQty, receivedQty,
  });
  const [serum, wash, minox, shampoo] = DEMO_PRODUCTS;
  const year = new Date().getFullYear();

  return {
    requests: [
      { id: 'PR-seed-3', requestNo: `PR-${year}-0003`, branch: 'Velachery', vendorId: 2, vendorName: DEMO_VENDORS[1].name, requestedBy: 'Priya Sharma', requestedAt: at(0), requiredBy: at(-5), priority: 'Urgent', remarks: 'Weekend bookings are high, need stock before Saturday.', items: [item(minox, 40), item(shampoo, 25)], status: 'Pending' },
      { id: 'PR-seed-2', requestNo: `PR-${year}-0002`, branch: 'Adyar', vendorId: 1, vendorName: DEMO_VENDORS[0].name, requestedBy: 'Karthik R', requestedAt: at(4), requiredBy: null, priority: 'Low', remarks: 'Trial stock.', items: [item(wash, 10)], status: 'Rejected', reviewedBy: 'Branch Head', reviewedAt: at(3), reviewRemarks: 'Central store already has enough stock - raise a transfer instead.' },
      { id: 'PR-seed-1', requestNo: `PR-${year}-0001`, branch: 'Anna Nagar', vendorId: 1, vendorName: DEMO_VENDORS[0].name, requestedBy: 'Anitha M', requestedAt: at(6), requiredBy: at(1), priority: 'Normal', remarks: 'Monthly replenishment.', items: [item(serum, 50), item(wash, 30)], status: 'Approved', reviewedBy: 'Branch Head', reviewedAt: at(5), reviewRemarks: 'Approved.', poId: 'PO-seed-1' },
    ],
    orders: [
      { id: 'PO-seed-1', poNo: `PO-${year}-0001`, invoiceNo: `INV-${year}-0001`, requestId: 'PR-seed-1', requestNo: `PR-${year}-0001`, branch: 'Anna Nagar', vendorId: 1, vendorName: DEMO_VENDORS[0].name, orderedAt: at(5), approvedBy: 'Branch Head', expectedAt: at(2), items: [{ ...item(serum, 50, 35), batchNo: 'HAS-2409' }, { ...item(wash, 30, 28), batchNo: 'VCF-1182' }], status: 'Partially Received' },
    ],
    inwards: [
      { id: 'GRN-seed-1', grnNo: `GRN-${year}-0001`, poId: 'PO-seed-1', poNo: `PO-${year}-0001`, vendorName: DEMO_VENDORS[0].name, store: CENTRAL_STORE, receivedBy: 'Store Keeper', receivedAt: at(2), vendorInvoiceNo: 'DSP/7781', isPartial: true, noteId: 'NT-seed-1',
        lines: [
          { productId: serum.id, productName: serum.name, batchNo: 'HAS-2409', mfgDate: at(60), expiryDate: at(-640), orderedQty: 50, previousQty: 0, receivedQty: 35, damagedQty: 0, unitPrice: serum.unitPrice },
          { productId: wash.id, productName: wash.name, batchNo: 'VCF-1182', mfgDate: at(45), expiryDate: at(-500), orderedQty: 30, previousQty: 0, receivedQty: 30, damagedQty: 2, unitPrice: wash.unitPrice },
        ] },
    ],
    returns: [],
    notes: [
      { id: 'NT-seed-1', noteNo: `DN-${year}-0001`, type: 'Debit Note', vendorName: DEMO_VENDORS[0].name, poNo: `PO-${year}-0001`, grnNo: `GRN-${year}-0001`, reason: '2 face wash bottles damaged in transit; 15 serum units short.', amount: 2 * wash.unitPrice + 15 * serum.unitPrice, createdAt: at(2), status: 'Open' },
    ],
    stock: [
      { id: 'STK-seed-1', store: CENTRAL_STORE, productId: serum.id, productCode: serum.code, productName: serum.name, batchNo: 'HAS-2409', expiryDate: at(-640), qty: 23, unitPrice: serum.unitPrice },
      { id: 'STK-seed-2', store: CENTRAL_STORE, productId: wash.id, productCode: wash.code, productName: wash.name, batchNo: 'VCF-1182', expiryDate: at(-500), qty: 20, unitPrice: wash.unitPrice },
      { id: 'STK-seed-3', store: CENTRAL_STORE, productId: minox.id, productCode: minox.code, productName: minox.name, batchNo: 'MNX-0931', expiryDate: at(-300), qty: 6, unitPrice: minox.unitPrice },
      { id: 'STK-seed-4', store: 'Anna Nagar', productId: serum.id, productCode: serum.code, productName: serum.name, batchNo: 'HAS-2409', expiryDate: at(-640), qty: 4, unitPrice: serum.unitPrice },
      { id: 'STK-seed-5', store: 'Anna Nagar', productId: wash.id, productCode: wash.code, productName: wash.name, batchNo: 'VCF-1182', expiryDate: at(-500), qty: 6, unitPrice: wash.unitPrice },
      { id: 'STK-seed-6', store: 'Velachery', productId: serum.id, productCode: serum.code, productName: serum.name, batchNo: 'HAS-2409', expiryDate: at(-640), qty: 8, unitPrice: serum.unitPrice },
    ],
    transfers: [
      { id: 'TR-seed-2', transferNo: `ST-${year}-0002`, fromStore: CENTRAL_STORE, toStore: 'Velachery', productName: serum.name, batchNo: 'HAS-2409', qty: 8, transferredBy: 'Store Keeper', transferredAt: at(1), remarks: '' },
      { id: 'TR-seed-1', transferNo: `ST-${year}-0001`, fromStore: CENTRAL_STORE, toStore: 'Anna Nagar', productName: serum.name, batchNo: 'HAS-2409', qty: 4, transferredBy: 'Store Keeper', transferredAt: at(1), remarks: 'Urgent top-up' },
    ],
  };
}
