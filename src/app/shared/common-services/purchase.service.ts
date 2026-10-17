import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, Observable, expand, firstValueFrom, map, reduce } from 'rxjs';
import Swal from 'sweetalert2';
import { ApiDataService } from '../../core/http/api.service';
import {
  CENTRAL_STORE,
  CENTRAL_STORE_KEY,
  DocumentStatus,
  GoodsInward,
  InwardLine,
  LOW_STOCK_THRESHOLD,
  Priority,
  PurchaseLineItem,
  PurchaseMeta,
  PurchaseOption,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseRequest,
  PurchaseRequestStatus,
  PurchaseReturn,
  PurchaseReturnReason,
  PurchaseReturnType,
  StockBatch,
  StockTransfer,
  StoreOption,
  TransferStatus,
  VendorNote,
  VendorNoteStatus,
  VendorNoteType,
} from '../models/purchase.model';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from './notification.service';
import { parseUnitKey, unitKey } from './branch-options.service';

const BASE = 'purchase';

export interface NewRequestInput {
  /** Requesting branch / franchise as a key: "branch:9" | "franchise:7". */
  branchKey: string;
  vendorId: number | null;
  requiredBy: string | null;
  priority: Priority;
  remarks: string;
  items: { productId: string; qty: number }[];
}

export interface InwardInput {
  poId: string;
  /** Store key: "central" | "branch:9" | "franchise:7". */
  storeKey: string;
  vendorInvoiceNo: string;
  billDate: string | null;
  freight: number;
  otherCharges: number;
  cashDiscount: number;
  roundOff: number;
  remarks: string;
  lines: Pick<InwardLine, 'productId' | 'batchNo' | 'mfgDate' | 'expiryDate' | 'receivedQty' | 'damagedQty' | 'freeQty' | 'unitPrice' | 'discountPercent' | 'sellingPrice'>[];
  note: { type: VendorNoteType; reason: string } | null;
}

export interface ReturnInput {
  grnId: string;
  reason: PurchaseReturnReason;
  returnType: PurchaseReturnType;
  remarks: string;
  lines: { productId: string; batchNo: string; qty: number }[];
  raiseNote: boolean;
}

export interface TransferInput {
  fromStoreKey: string;
  toStoreKey: string;
  remarks: string;
  lines: { batchId: string; qty: number }[];
}

export interface ReceiveLineInput {
  lineId: string;
  acceptedQty: number;
  rejectedQty: number;
  rejectReason: string | null;
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

export type PurchaseDocument = 'purchase-request' | 'purchase-order' | 'goods-inward' | 'purchase-return' | 'vendor-note' | 'stock-transfer';

export type PurchaseCollection = 'requests' | 'orders' | 'inwards' | 'returns' | 'notes' | 'stock' | 'transfers';

interface PurchaseState {
  requests: PurchaseRequest[];
  orders: PurchaseOrder[];
  inwards: GoodsInward[];
  returns: PurchaseReturn[];
  notes: VendorNote[];
  stock: StockBatch[];
  transfers: StockTransfer[];
}

const emptyState = (): PurchaseState => ({ requests: [], orders: [], inwards: [], returns: [], notes: [], stock: [], transfers: [] });

const ENDPOINTS: Record<PurchaseCollection, string> = {
  requests: `${BASE}/requests`,
  orders: `${BASE}/orders`,
  inwards: `${BASE}/inwards`,
  returns: `${BASE}/returns`,
  notes: `${BASE}/vendor-notes`,
  stock: `${BASE}/stock`,
  transfers: `${BASE}/stock/transfers`,
};

const DEFAULT_META: PurchaseMeta = {
  stores: [{ key: CENTRAL_STORE_KEY, type: null, id: null, name: CENTRAL_STORE }],
  branches: [],
  vendors: [],
  priorities: ['Low', 'Normal', 'Urgent'],
  returnReasons: [],
  returnTypes: ['Debit Note', 'Replacement'],
  transferRejectReasons: [],
  lowStockThreshold: LOW_STOCK_THRESHOLD,
  roundOffLimit: 5,
  centralStore: CENTRAL_STORE,
  canApprove: false,
  userStoreKey: null,
};

/**
 * Purchase Management state backed by /api/purchase. Lists are loaded into signals (pages filter / sort / page them
 * on the client); every action is an API call - the server enforces the rules and its message is shown to the user -
 * after which the affected lists are reloaded.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseService {
  private readonly api = inject(ApiDataService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);

  private readonly state = signal<PurchaseState>(emptyState());
  readonly meta = signal<PurchaseMeta>(DEFAULT_META);
  /** True while the open tab's lists are loading. */
  readonly loading = signal(false);
  /** Lists fetched at least once (for the signed-in user). */
  private readonly loaded = new Set<PurchaseCollection>();
  /** Lists of the open tab - the only ones reloaded after an action. */
  private active = new Set<PurchaseCollection>();
  /** User the cached meta / lists belong to; a different sign-in starts clean. */
  private cachedFor: unknown = undefined;

  readonly requests = computed(() => this.state().requests);
  readonly orders = computed(() => this.state().orders);
  readonly inwards = computed(() => this.state().inwards);
  readonly returns = computed(() => this.state().returns);
  readonly notes = computed(() => this.state().notes);
  readonly stock = computed(() => this.state().stock);
  readonly transfers = computed(() => this.state().transfers);

  readonly storeOptions = computed(() => this.meta().stores);
  readonly branchOptions = computed(() => this.meta().branches);
  /** Store / branch names, for the filter cards. */
  readonly stores = computed(() => this.meta().stores.map(s => s.name));
  readonly branches = computed(() => this.meta().branches.map(s => s.name));
  readonly vendors = computed(() => this.meta().vendors);
  readonly threshold = computed(() => this.meta().lowStockThreshold);

  /** Branch heads / managers / admins approve, cancel and close (decided by the server). */
  readonly canApprove = computed(() => this.meta().canApprove);
  readonly pendingCount = computed(() => this.requests().filter(r => r.status === 'Pending').length);
  readonly openTransfers = computed(() => this.transfers().filter(t => t.status === 'In Transit' || t.status === 'Partially Received'));

  /** Per store + product totals under the threshold. */
  readonly lowStock = computed(() => {
    const totals = new Map<string, { store: string; productName: string; qty: number }>();
    for (const b of this.stock()) {
      const key = `${b.storeKey}|${b.productId}`;
      const row = totals.get(key) ?? { store: b.store, productName: b.productName, qty: 0 };
      row.qty += b.qty;
      totals.set(key, row);
    }
    return [...totals.values()].filter(t => t.qty < this.threshold());
  });

  /**
   * Called by a tab page every time it opens (sidebar link, tab click, page refresh): fetches just that tab's lists,
   * plus meta when it is not loaded yet for this user.
   */
  async load(...keys: PurchaseCollection[]): Promise<void> {
    this.resetIfUserChanged();
    this.active = new Set(keys);
    this.loading.set(true);
    try {
      await this.fetch(keys);
    } finally {
      this.loading.set(false);
    }
  }

  /** Always fetches the given lists, without changing the open tab (e.g. a dialog that needs fresh orders). */
  reload(...keys: PurchaseCollection[]): Promise<void> {
    this.resetIfUserChanged();
    return this.fetch(keys);
  }

  /** Fetches the given lists only if they were never loaded. Safe to call from templates / computeds. */
  ensure(...keys: PurchaseCollection[]): void {
    if (this.auth.currentUser() === this.cachedFor && keys.every(k => this.loaded.has(k))) return;
    // Deferred: callers may be inside a template / computed, where writing a signal synchronously is not allowed.
    queueMicrotask(() => {
      this.resetIfUserChanged();
      const missing = keys.filter(k => !this.loaded.has(k));
      if (missing.length) void this.fetch(missing);
    });
  }

  /** After an action: reloads the named lists that the open tab shows; the rest reload when their tab opens. */
  private async refresh(...keys: PurchaseCollection[]): Promise<void> {
    await this.fetch(keys.filter(k => this.active.has(k)));
  }

  private async fetch(keys: PurchaseCollection[]): Promise<void> {
    // Marked up front so overlapping calls do not fire the same request twice.
    keys.forEach(k => this.loaded.add(k));
    const jobs: Promise<unknown>[] = keys.map(k => this.loadCollection(k));
    if (!this.metaLoaded) {
      this.metaLoaded = true;
      jobs.push(this.loadMeta());
    }
    await Promise.all(jobs);
  }

  private metaLoaded = false;

  private resetIfUserChanged(): void {
    const user = this.auth.currentUser();
    if (user === this.cachedFor) return;
    this.cachedFor = user;
    this.state.set(emptyState());
    this.meta.set(DEFAULT_META);
    this.metaLoaded = false;
    this.loaded.clear();
    this.active.clear();
  }

  // ---- Lookups ---------------------------------------------------------------------------------

  /** Active products (price + GST from the product master); only the vendor's products when one is given. */
  productOptions(vendorId?: number | null): Observable<PurchaseOption[]> {
    const query = vendorId ? `?vendor_id=${vendorId}` : '';
    return (this.api.GET(`${BASE}/products${query}`) as Observable<any>).pipe(
      map(res => ((res?.data ?? []) as any[]).map(p => ({
        id: String(p.id), code: p.code, name: p.name, vendorId: p.vendor_id ?? null,
        unitPrice: Number(p.unit_price) || 0, gstPercent: Number(p.gst_percent) || 0,
      }))),
    );
  }

  /** @deprecated use vendors() - kept for older callers. */
  vendorOptions(): Observable<{ id: number; name: string }[]> {
    return (this.api.GET(`${BASE}/meta`) as Observable<any>).pipe(map(res => (res?.data?.vendors ?? []) as { id: number; name: string }[]));
  }

  storeName(storeKey: string): string {
    return this.meta().stores.find(s => s.key === storeKey)?.name ?? (storeKey === CENTRAL_STORE_KEY ? this.meta().centralStore : storeKey);
  }

  /** Units of a product held by a store (by store name, as the pages show it). */
  storeQty(store: string, productId: string): number {
    return this.stock().filter(b => b.store === store && b.productId === productId).reduce((s, b) => s + b.qty, 0);
  }

  storeQtyByKey(storeKey: string, productId: string): number {
    return this.stock().filter(b => b.storeKey === storeKey && b.productId === productId).reduce((s, b) => s + b.qty, 0);
  }

  /** Batches of a store with qty on hand, earliest expiry first (FEFO) - the order transfers should pick from. */
  availableBatches(storeKey: string): StockBatch[] {
    return this.stock()
      .filter(b => b.storeKey === storeKey && b.qty > 0)
      .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999') || a.batchNo.localeCompare(b.batchNo));
  }

  // ---- Purchase requests ----------------------------------------------------------------------

  async createRequest(input: NewRequestInput): Promise<PurchaseRequest | null> {
    const res = await this.send('POST', `${BASE}/requests`, {
      ...unitPair(input.branchKey), vendor_id: input.vendorId, required_by: input.requiredBy || null,
      priority: input.priority, remarks: input.remarks || null,
      items: input.items.map(i => ({ product_id: Number(i.productId), qty: i.qty })),
    });
    if (!res) return null;
    await this.refresh('requests');
    this.notifications.add({ type: 'purchase', title: 'Purchase request sent', message: `${res.data.request_no} is waiting for branch head approval.`, link: '/app/inventory/purchase-requests' });
    return toRequest(res.data);
  }

  async approveRequest(id: string, remarks: string, expectedAt: string | null): Promise<PurchaseOrder | null> {
    const res = await this.send('POST', `${BASE}/requests/${id}/approve`, { remarks: remarks || null, expected_at: expectedAt || null });
    if (!res) return null;
    await this.refresh('requests', 'orders');
    const order = toOrder(res.data.order);
    this.notifications.add({ type: 'manager', title: 'Purchase order confirmed', message: `${order.poNo} raised to ${order.vendorName}.`, link: '/app/inventory/purchase-orders' });
    return this.orders().find(o => o.id === order.id) ?? order;
  }

  async rejectRequest(id: string, remarks: string): Promise<boolean> {
    const res = await this.send('POST', `${BASE}/requests/${id}/reject`, { remarks });
    if (res) await this.refresh('requests');
    return !!res;
  }

  // ---- Purchase orders (reference: Edit PO / Cancel PO / Abort PO) -----------------------------

  async updateOrder(id: string, change: { expectedAt?: string | null; items?: { id: string; qty: number }[] }): Promise<boolean> {
    const body: Record<string, unknown> = {};
    if (change.expectedAt !== undefined) body['expected_at'] = change.expectedAt || null;
    if (change.items?.length) body['items'] = change.items.map(i => ({ id: Number(i.id), qty: i.qty }));
    const res = await this.send('PUT', `${BASE}/orders/${id}`, body);
    if (res) await this.refresh('orders');
    return !!res;
  }

  async cancelOrder(id: string, reason: string): Promise<boolean> {
    const res = await this.send('POST', `${BASE}/orders/${id}/cancel`, { reason });
    if (res) await this.refresh('orders');
    return !!res;
  }

  async closeOrder(id: string, reason: string): Promise<boolean> {
    const res = await this.send('POST', `${BASE}/orders/${id}/close`, { reason });
    if (res) await this.refresh('orders');
    return !!res;
  }

  // ---- Purchase inward (GRN) ------------------------------------------------------------------

  /** Pending lines of a PO with their suggested batch numbers (generated by the server). */
  async inwardDefaults(orderId: string): Promise<InwardLine[] | null> {
    const res = await this.send('GET', `${BASE}/orders/${orderId}/inward-defaults`, null, false);
    return res ? ((res.data.lines ?? []) as any[]).map(toInwardLine) : null;
  }

  async recordInward(input: InwardInput): Promise<GoodsInward | null> {
    const res = await this.send('POST', `${BASE}/orders/${input.poId}/inward`, {
      store_id: input.storeKey, vendor_invoice_no: input.vendorInvoiceNo, bill_date: input.billDate || null,
      freight: input.freight || 0, other_charges: input.otherCharges || 0, cash_discount: input.cashDiscount || 0,
      round_off: input.roundOff || 0, remarks: input.remarks || null,
      lines: input.lines.map(l => ({
        product_id: Number(l.productId), batch_no: l.batchNo || null, mfg_date: l.mfgDate || null, expiry_date: l.expiryDate || null,
        received_qty: l.receivedQty, damaged_qty: l.damagedQty || 0, free_qty: l.freeQty || 0,
        unit_price: l.unitPrice, discount_percent: l.discountPercent || 0, selling_price: l.sellingPrice || null,
      })),
      note: input.note,
    });
    if (!res) return null;
    // Stock is always re-read: the low-stock check below needs current quantities.
    await Promise.all([this.refresh('orders', 'inwards', 'notes'), this.reload('stock')]);
    const inward = toInward(res.data);
    this.checkLowStock(inward.storeKey, inward.lines.map(l => l.productId));
    return inward;
  }

  async cancelInward(id: string, reason: string): Promise<boolean> {
    const res = await this.send('POST', `${BASE}/inwards/${id}/cancel`, { reason });
    if (res) await this.refresh('orders', 'inwards', 'stock', 'notes');
    return !!res;
  }

  // ---- Purchase return ------------------------------------------------------------------------

  /** GRNs that still have at least one unit that can go back to the vendor. */
  async returnableInwards(): Promise<GoodsInward[]> {
    const res = await this.send('GET', `${BASE}/returns/returnable-inwards`, null, false);
    return res ? (res.data as any[]).map(toInward) : [];
  }

  async returnableLines(grnId: string): Promise<ReturnableLine[]> {
    const res = await this.send('GET', `${BASE}/inwards/${grnId}/returnable-lines`, null, false);
    return res ? (res.data as any[]).map(l => ({
      productId: String(l.product_id), productName: l.product_name, batchNo: l.batch_no, unitPrice: Number(l.unit_price) || 0,
      accepted: l.accepted, returned: l.returned, inStock: l.in_stock, returnable: l.returnable,
    })) : [];
  }

  async recordReturn(input: ReturnInput): Promise<PurchaseReturn | null> {
    const res = await this.send('POST', `${BASE}/returns`, {
      grn_id: Number(input.grnId), reason: input.reason, return_type: input.returnType, remarks: input.remarks || null,
      raise_note: input.returnType === 'Debit Note' && input.raiseNote,
      lines: input.lines.map(l => ({ product_id: Number(l.productId), batch_no: l.batchNo, qty: l.qty })),
    });
    if (!res) return null;
    // Stock is always re-read: the low-stock check below needs current quantities.
    await Promise.all([this.refresh('returns', 'notes', 'orders'), this.reload('stock')]);
    const ret = toReturn(res.data);
    this.checkLowStock(ret.storeKey, ret.lines.map(l => l.productId));
    return ret;
  }

  async cancelReturn(id: string, reason: string): Promise<boolean> {
    const res = await this.send('POST', `${BASE}/returns/${id}/cancel`, { reason });
    if (res) await this.refresh('returns', 'stock', 'notes', 'orders');
    return !!res;
  }

  // ---- Credit / debit notes -------------------------------------------------------------------

  async setNoteStatus(id: string, status: 'Open' | 'Adjusted'): Promise<boolean> {
    const res = await this.send('POST', `${BASE}/vendor-notes/${id}/${status === 'Adjusted' ? 'adjust' : 'reopen'}`, {});
    if (res) await this.refresh('notes');
    return !!res;
  }

  // ---- Stock transfer: dispatch -> accept / reject (or cancel) ---------------------------------

  async dispatchTransfer(input: TransferInput): Promise<StockTransfer | null> {
    const res = await this.send('POST', `${BASE}/stock/transfers`, {
      from_store_id: input.fromStoreKey, to_store_id: input.toStoreKey, remarks: input.remarks || null,
      lines: input.lines.map(l => ({ batch_id: Number(l.batchId), qty: l.qty })),
    });
    if (!res) return null;
    await this.refresh('stock', 'transfers');
    const transfer = toTransfer(res.data);
    this.notifications.add({ type: 'stock', title: 'Stock dispatched', message: `${transfer.transferNo}: ${transfer.qty} unit(s) in transit to ${transfer.toStore}. Waiting for the store to accept.`, link: '/app/inventory/stock' });
    this.checkLowStock(transfer.fromStoreKey, transfer.lines.map(l => l.productId));
    return transfer;
  }

  async receiveTransfer(id: string, lines: ReceiveLineInput[], remarks: string): Promise<StockTransfer | null> {
    const res = await this.send('POST', `${BASE}/stock/transfers/${id}/receive`, {
      remarks: remarks || null,
      lines: lines.map(l => ({ line_id: Number(l.lineId), accepted_qty: l.acceptedQty || 0, rejected_qty: l.rejectedQty || 0, reject_reason: l.rejectedQty ? l.rejectReason : null })),
    });
    if (!res) return null;
    await this.refresh('stock', 'transfers');
    return toTransfer(res.data);
  }

  async cancelTransfer(id: string, reason: string): Promise<boolean> {
    const res = await this.send('POST', `${BASE}/stock/transfers/${id}/cancel`, { reason });
    if (res) await this.refresh('stock', 'transfers');
    return !!res;
  }

  /** E-mails the branch heads about every store running low (server side). */
  async notifyLowStock(): Promise<void> {
    await this.send('POST', `${BASE}/stock/notify-low-stock`, {});
  }

  // ---- Documents ------------------------------------------------------------------------------

  /** Opens the server-rendered PDF (tax-invoice layout) in a new tab. */
  async openPdf(type: PurchaseDocument, id: string): Promise<void> {
    const tab = window.open('', '_blank');
    try {
      const blob = await firstValueFrom(this.api.GET_BLOB(`${BASE}/documents/${type}/${id}/pdf`) as Observable<Blob>);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
      Swal.fire({ icon: 'error', title: 'Could not open the document', text: 'Please try again.', confirmButtonColor: '#6C63FF' });
    }
  }

  /** Asks for the mandatory reason before a cancel / close (reference: cancel reason is required). */
  async askReason(title: string, text: string, confirmText: string): Promise<string | null> {
    const { value, isConfirmed } = await Swal.fire({
      title, text, input: 'textarea', inputPlaceholder: 'Reason (required)', showCancelButton: true,
      confirmButtonText: confirmText, confirmButtonColor: '#d33', inputAttributes: { maxlength: '255' },
      inputValidator: v => (v && v.trim().length >= 3 ? null : 'Enter a reason.'),
    });
    return isConfirmed && value ? String(value).trim() : null;
  }

  // ---- Plumbing -------------------------------------------------------------------------------

  private async loadMeta(): Promise<void> {
    const res = await this.send('GET', `${BASE}/meta`, null, false);
    const d = res?.data;
    if (!d) {
      this.metaLoaded = false; // retried by the next tab load
      return;
    }
    const stores = ((d.stores ?? []) as any[]).map(s => ({ key: s.key ?? CENTRAL_STORE_KEY, type: s.type ?? null, id: s.id ?? null, name: s.name }) as StoreOption);
    this.meta.set({
      stores, branches: stores.filter(s => s.id !== null), vendors: d.vendors ?? [],
      priorities: d.priorities ?? DEFAULT_META.priorities, returnReasons: d.return_reasons ?? [],
      returnTypes: d.return_types ?? DEFAULT_META.returnTypes, transferRejectReasons: d.transfer_reject_reasons ?? [],
      lowStockThreshold: Number(d.low_stock_threshold) || LOW_STOCK_THRESHOLD, roundOffLimit: Number(d.round_off_limit) || 0,
      centralStore: d.central_store || CENTRAL_STORE, canApprove: !!d.can_approve, userStoreKey: d.user_store_key ?? null,
    });
  }

  private async loadCollection(key: PurchaseCollection): Promise<void> {
    const mapper: Record<PurchaseCollection, (r: any) => unknown> = {
      requests: toRequest, orders: toOrder, inwards: toInward, returns: toReturn, notes: toNote, stock: toBatch, transfers: toTransfer,
    };
    try {
      const rows = await firstValueFrom(this.fetchAll(ENDPOINTS[key]));
      this.state.update(s => ({ ...s, [key]: rows.map(mapper[key]) }));
    } catch (e) {
      this.loaded.delete(key);
      console.error(`Purchase: could not load ${key}`, e);
    }
  }

  /** Every page of a paginated list ({data, pagination: {last_page}}). */
  private fetchAll(path: string): Observable<any[]> {
    const page = (n: number) => this.api.GET(`${path}?per_page=200&page=${n}`) as Observable<any>;
    return page(1).pipe(
      expand(res => {
        const current = Number(res?.pagination?.current_page ?? 1);
        return current < Number(res?.pagination?.last_page ?? 1) ? page(current + 1) : EMPTY;
      }),
      reduce((all: any[], res: any) => [...all, ...((res?.data ?? []) as any[])], []),
    );
  }

  /** Runs a request; shows the server's success toast or error (incl. validation messages). Null on failure. */
  private async send(method: 'GET' | 'POST' | 'PUT', path: string, body: unknown, toast = true): Promise<any | null> {
    try {
      const call = method === 'GET' ? this.api.GET(path) : method === 'POST' ? this.api.POST(path, body) : this.api.PUT(path, body);
      const res = await firstValueFrom(call as Observable<any>);
      if (toast && res?.message) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: res.message, showConfirmButton: false, timer: 3500, timerProgressBar: true });
      }
      return res;
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Not saved', html: errorHtml(e), confirmButtonColor: '#6C63FF' });
      return null;
    }
  }

  /** Bell notification for every product that dropped under the threshold at a store. */
  private checkLowStock(storeKey: string, productIds: string[]): void {
    for (const productId of new Set(productIds)) {
      const qty = this.storeQtyByKey(storeKey, productId);
      if (qty >= this.threshold()) continue;
      const name = this.stock().find(b => b.productId === productId)?.productName ?? 'Product';
      this.notifications.add({ type: 'stock', title: 'Low stock alert', message: `${name} is running low at ${this.storeName(storeKey)} (${qty} units left).`, link: '/app/inventory/stock' });
    }
  }
}

// ---- API -> model mappers ----------------------------------------------------------------------

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function errorHtml(e: unknown): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  if (e instanceof HttpErrorResponse) {
    const body = e.error ?? {};
    const details = body.errors && typeof body.errors === 'object' && !Array.isArray(body.errors)
      ? Object.values(body.errors as Record<string, string[]>).flat().filter(m => typeof m === 'string')
      : [];
    const message = (details.length ? details : [body.message || e.message || 'Something went wrong.']).slice(0, 6);
    return message.map(m => esc(String(m))).join('<br>');
  }
  return esc(e instanceof Error ? e.message : 'Something went wrong.');
}

/** "branch:9" -> the type + id pair the API takes for a requesting branch / franchise. */
function unitPair(key: string): { branch_or_franchise_type: string | null; branch_or_franchise_id: number | null } {
  const ref = parseUnitKey(key);
  return { branch_or_franchise_type: ref?.type ?? null, branch_or_franchise_id: ref?.id ?? null };
}

function toRequest(r: any): PurchaseRequest {
  return {
    id: str(r.id), requestNo: r.request_no, branch: r.branch?.name ?? '-', branchKey: unitKey(r.branch_or_franchise_type, r.branch_or_franchise_id) || null,
    vendorId: r.vendor_id ?? null, vendorName: r.vendor_name ?? '-', requestedBy: r.requested_by ?? '-',
    requestedAt: r.requested_at, requiredBy: r.required_by ?? null, priority: r.priority, remarks: r.remarks ?? '',
    status: r.status as PurchaseRequestStatus, reviewedBy: r.reviewed_by ?? undefined, reviewedAt: r.reviewed_at ?? undefined,
    reviewRemarks: r.review_remarks ?? undefined, poId: r.po_id ? str(r.po_id) : undefined,
    items: ((r.items ?? []) as any[]).map(i => ({
      productId: str(i.product_id), productCode: i.product_code, productName: i.product_name, unitPrice: num(i.unit_price),
      gstPercent: num(i.gst_percent), requestedQty: num(i.qty), receivedQty: 0,
    })),
  };
}

function toOrder(o: any): PurchaseOrder {
  return {
    id: str(o.id), poNo: o.po_no, invoiceNo: o.invoice_no, requestId: str(o.request_id), requestNo: o.request_no ?? '-',
    branch: o.branch?.name ?? '-', vendorId: o.vendor_id ?? null, vendorName: o.vendor_name ?? '-', orderedAt: o.ordered_at,
    approvedBy: o.approved_by ?? '-', expectedAt: o.expected_at ?? null, status: o.status as PurchaseOrderStatus,
    closeReason: o.close_reason ?? null, closedBy: o.closed_by ?? null, closedAt: o.closed_at ?? null,
    canEdit: !!o.can_edit, canEditQty: !!o.can_edit_qty, canInward: !!o.can_inward, canCancel: !!o.can_cancel, canClose: !!o.can_close,
    items: ((o.items ?? []) as any[]).map((i): PurchaseLineItem => ({
      id: str(i.id), productId: str(i.product_id), productCode: i.product_code, productName: i.product_name,
      unitPrice: num(i.unit_price), gstPercent: num(i.gst_percent), requestedQty: num(i.requested_qty), receivedQty: num(i.received_qty),
      closedQty: num(i.closed_qty), pendingQty: num(i.pending_qty), batchNo: i.batch_no,
    })),
  };
}

function toInwardLine(l: any): InwardLine {
  return {
    productId: str(l.product_id), productName: l.product_name, batchNo: l.batch_no ?? '', mfgDate: l.mfg_date ?? null,
    expiryDate: l.expiry_date ?? null, orderedQty: num(l.ordered_qty), previousQty: num(l.previous_qty), receivedQty: num(l.received_qty),
    damagedQty: num(l.damaged_qty), freeQty: num(l.free_qty), unitPrice: num(l.unit_price), discountPercent: num(l.discount_percent),
    gstPercent: num(l.gst_percent), sellingPrice: l.selling_price === null || l.selling_price === undefined ? null : num(l.selling_price),
    lineTotal: num(l.line_total),
  };
}

function toInward(g: any): GoodsInward {
  return {
    id: str(g.id), grnNo: g.grn_no, poId: str(g.po_id), poNo: g.po_no ?? '-', vendorName: g.vendor_name ?? '-',
    store: g.store ?? CENTRAL_STORE, storeKey: g.store_key ?? CENTRAL_STORE_KEY, receivedBy: g.received_by ?? '-', receivedAt: g.received_at,
    vendorInvoiceNo: g.vendor_invoice_no ?? '', isPartial: !!g.is_partial, noteId: g.note_id ? str(g.note_id) : undefined,
    noteNo: g.note_no ?? undefined, status: (g.status ?? 'Posted') as DocumentStatus, billDate: g.bill_date ?? null,
    freight: num(g.freight), otherCharges: num(g.other_charges), cashDiscount: num(g.cash_discount), roundOff: num(g.round_off),
    netAmount: num(g.net_amount), remarks: g.remarks ?? '', cancelReason: g.cancel_reason ?? null, canCancel: !!g.can_cancel,
    lines: ((g.lines ?? []) as any[]).map(toInwardLine),
  };
}

function toReturn(r: any): PurchaseReturn {
  return {
    id: str(r.id), returnNo: r.return_no, grnId: str(r.grn_id), grnNo: r.grn_no ?? '-', poNo: r.po_no ?? '-',
    vendorName: r.vendor_name ?? '-', store: r.store ?? CENTRAL_STORE, storeKey: r.store_key ?? CENTRAL_STORE_KEY, reason: r.reason,
    returnType: (r.return_type ?? 'Debit Note') as PurchaseReturnType, remarks: r.remarks ?? '', returnedBy: r.returned_by ?? '-',
    returnedAt: r.returned_at, noteId: r.note_id ? str(r.note_id) : undefined, noteNo: r.note_no ?? undefined,
    status: (r.status ?? 'Posted') as DocumentStatus, cancelReason: r.cancel_reason ?? null, canCancel: !!r.can_cancel,
    lines: ((r.lines ?? []) as any[]).map(l => ({ productId: str(l.product_id), productName: l.product_name, batchNo: l.batch_no, qty: num(l.qty), unitPrice: num(l.unit_price) })),
  };
}

function toNote(n: any): VendorNote {
  return {
    id: str(n.id), noteNo: n.note_no, type: n.type as VendorNoteType, vendorId: n.vendor_id ?? null, vendorName: n.vendor_name ?? '-',
    poNo: n.po_no ?? '-', grnNo: n.grn_no ?? '-', returnNo: n.return_no ?? undefined, reason: n.reason ?? '', amount: num(n.amount),
    createdAt: n.created_at, status: n.status as VendorNoteStatus,
  };
}

function toBatch(b: any): StockBatch {
  return {
    id: str(b.id), store: b.store ?? CENTRAL_STORE, storeKey: b.store_key ?? CENTRAL_STORE_KEY, productId: str(b.product_id), productCode: b.product_code ?? '',
    productName: b.product_name, batchNo: b.batch_no, expiryDate: b.expiry_date ?? null, qty: num(b.qty), unitPrice: num(b.unit_price),
    sellingPrice: b.selling_price === null || b.selling_price === undefined ? null : num(b.selling_price),
  };
}

function toTransfer(t: any): StockTransfer {
  return {
    id: str(t.id), transferNo: t.transfer_no, kind: t.kind === 'Return' ? 'Return' : 'Transfer', status: t.status as TransferStatus,
    fromStoreKey: t.from_store_key ?? CENTRAL_STORE_KEY, fromStore: t.from_store, toStoreKey: t.to_store_key ?? CENTRAL_STORE_KEY, toStore: t.to_store,
    qty: num(t.qty), acceptedQty: num(t.accepted_qty), rejectedQty: num(t.rejected_qty), pendingQty: num(t.pending_qty),
    transferredBy: t.transferred_by ?? '-', transferredAt: t.transferred_at, remarks: t.remarks ?? '',
    receivedBy: t.received_by ?? null, receivedAt: t.received_at ?? null, cancelReason: t.cancel_reason ?? null,
    canReceive: !!t.can_receive, canCancel: !!t.can_cancel,
    lines: ((t.lines ?? []) as any[]).map(l => ({
      id: str(l.id), productId: str(l.product_id), productName: l.product_name, batchNo: l.batch_no, expiryDate: l.expiry_date ?? null,
      qty: num(l.qty), acceptedQty: num(l.accepted_qty), rejectedQty: num(l.rejected_qty), pendingQty: num(l.pending_qty),
      rejectReason: l.reject_reason ?? null,
    })),
  };
}
