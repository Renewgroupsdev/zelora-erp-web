/**
 * Purchase Management - request -> branch-head approval -> PO + invoice -> batch-wise inward -> central/branch stock,
 * with returns, credit/debit notes and two-step stock transfers. Data comes from the /api/purchase endpoints;
 * ids are kept as strings so table rows can carry them unchanged.
 */

export type PurchaseRequestStatus = 'Pending' | 'Approved' | 'Rejected';
/** Closed = short-closed (aborted) with the pending qty written off; Cancelled = nothing was ever received. */
export type PurchaseOrderStatus = 'Ordered' | 'Partially Received' | 'Received' | 'Closed' | 'Cancelled';
export type DocumentStatus = 'Posted' | 'Cancelled';
export type TransferStatus = 'In Transit' | 'Partially Received' | 'Received' | 'Cancelled';
export type VendorNoteType = 'Credit Note' | 'Debit Note';
export type VendorNoteStatus = 'Open' | 'Adjusted' | 'Cancelled';
export type Priority = 'Low' | 'Normal' | 'Urgent';
export type PurchaseReturnType = 'Debit Note' | 'Replacement';

/** Fallback until /purchase/meta loads; the server value wins. */
export const LOW_STOCK_THRESHOLD = 10;
export const CENTRAL_STORE = 'Central Store';

/** Key of the Central Store; a branch / franchise store is "branch:9" / "franchise:7" (the API exchanges stores as these keys). */
export const CENTRAL_STORE_KEY = 'central';

/** A branch / franchise store, or the Central Store (key "central", type and id null). */
export interface StoreOption {
  key: string;
  type: 'branch' | 'franchise' | null;
  id: number | null;
  name: string;
}

export interface PurchaseMeta {
  stores: StoreOption[];
  branches: StoreOption[];
  vendors: { id: number; name: string }[];
  priorities: Priority[];
  returnReasons: string[];
  returnTypes: PurchaseReturnType[];
  transferRejectReasons: string[];
  lowStockThreshold: number;
  roundOffLimit: number;
  centralStore: string;
  canApprove: boolean;
  /** The user's own branch / franchise as a store key, null when the user has none. */
  /** The user's own branch / franchise as a store key, null when the user has none. */
  userStoreKey: string | null;
}

export interface PurchaseLineItem {
  productId: string;
  productCode: string;
  hsnCode?: string | null;
  productName: string;
  unitPrice: number;
  gstPercent: number;
  requestedQty: number;
  /** Total accepted into stock so far across every inward against the PO. */
  receivedQty: number;
  /** PO line id (absent on a request line). */
  id?: string;
  /** Written off when the PO was closed. */
  closedQty?: number;
  /** requested - received - closed. */
  pendingQty?: number;
  /** Auto-generated when the request is approved and the PO is raised (empty on a request). */
  batchNo?: string;
}

export interface PurchaseRequest {
  id: string;
  requestNo: string;
  branch: string;
  /** "branch:9" | "franchise:7" (null when not set). */
  branchKey: string | null;
  vendorId: number | null;
  vendorName: string;
  requestedBy: string;
  requestedAt: string;
  requiredBy: string | null;
  priority: Priority;
  remarks: string;
  items: PurchaseLineItem[];
  status: PurchaseRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewRemarks?: string;
  poId?: string;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  invoiceNo: string;
  requestId: string;
  requestNo: string;
  branch: string;
  vendorId: number | null;
  vendorName: string;
  orderedAt: string;
  approvedBy: string;
  expectedAt: string | null;
  items: PurchaseLineItem[];
  status: PurchaseOrderStatus;
  closeReason: string | null;
  closedBy: string | null;
  closedAt: string | null;
  /** Server-side action flags (reference: showeditpo / showaddinward / showcancelpo / showabortpo). */
  canEdit: boolean;
  canEditQty: boolean;
  canInward: boolean;
  canCancel: boolean;
  canClose: boolean;
}

export interface InwardLine {
  productId: string;
  productName: string;
  batchNo: string;
  mfgDate: string | null;
  expiryDate: string | null;
  orderedQty: number;
  /** Already received before this inward. */
  previousQty: number;
  receivedQty: number;
  damagedQty: number;
  /** Billed purchase rate (defaults to the PO rate). */
  unitPrice: number;
  /** Free units in the same batch: into stock, not billed, not counted against the PO. */
  freeQty: number;
  discountPercent: number;
  gstPercent: number;
  sellingPrice: number | null;
  /** received x rate x (1 - disc%) x (1 + GST%). */
  lineTotal: number;
}

export interface GoodsInward {
  id: string;
  grnNo: string;
  poId: string;
  poNo: string;
  vendorName: string;
  store: string;
  storeKey: string;
  receivedBy: string;
  receivedAt: string;
  vendorInvoiceNo: string;
  lines: InwardLine[];
  /** Partial when any PO line is still short after this inward. */
  isPartial: boolean;
  noteId?: string;
  noteNo?: string;
  status: DocumentStatus;
  billDate: string | null;
  freight: number;
  otherCharges: number;
  cashDiscount: number;
  roundOff: number;
  netAmount: number;
  remarks: string;
  cancelReason: string | null;
  canCancel: boolean;
}

export const PURCHASE_RETURN_REASONS = [
  'Damaged / Defective',
  'Expired / Near Expiry',
  'Wrong Item Supplied',
  'Excess Supply',
  'Quality Issue',
  'Other',
] as const;
export type PurchaseReturnReason = typeof PURCHASE_RETURN_REASONS[number];

export interface PurchaseReturnLine {
  productId: string;
  productName: string;
  batchNo: string;
  qty: number;
  unitPrice: number;
}

/** Stock sent back to the vendor against a purchase inward (GRN); reduces store stock and raises a debit note. */
export interface PurchaseReturn {
  id: string;
  returnNo: string;
  grnId: string;
  grnNo: string;
  poNo: string;
  vendorName: string;
  store: string;
  storeKey: string;
  reason: PurchaseReturnReason;
  returnType: PurchaseReturnType;
  remarks: string;
  lines: PurchaseReturnLine[];
  returnedBy: string;
  returnedAt: string;
  noteId?: string;
  noteNo?: string;
  status: DocumentStatus;
  cancelReason: string | null;
  canCancel: boolean;
}

export interface VendorNote {
  id: string;
  noteNo: string;
  type: VendorNoteType;
  vendorName: string;
  poNo: string;
  grnNo: string;
  /** Set when the note was raised from a purchase return. */
  returnNo?: string;
  vendorId?: number | null;
  reason: string;
  amount: number;
  createdAt: string;
  status: VendorNoteStatus;
}

export interface StockBatch {
  id: string;
  store: string;
  storeKey: string;
  productId: string;
  productCode: string;
  productName: string;
  batchNo: string;
  expiryDate: string | null;
  qty: number;
  unitPrice: number;
  sellingPrice: number | null;
}

export interface StockTransferLine {
  id: string;
  productId: string;
  productName: string;
  batchNo: string;
  expiryDate: string | null;
  /** Dispatched. */
  qty: number;
  acceptedQty: number;
  rejectedQty: number;
  /** Still in transit. */
  pendingQty: number;
  rejectReason: string | null;
}

/**
 * Two-step transfer (reference stock transfer / stock return): dispatched "In Transit", then the receiving store accepts
 * or rejects each line; rejected units go back to the source. Branch -> Central Store is a "Return".
 */
export interface StockTransfer {
  id: string;
  transferNo: string;
  kind: 'Transfer' | 'Return';
  status: TransferStatus;
  fromStoreKey: string;
  fromStore: string;
  toStoreKey: string;
  toStore: string;
  lines: StockTransferLine[];
  qty: number;
  acceptedQty: number;
  rejectedQty: number;
  pendingQty: number;
  transferredBy: string;
  transferredAt: string;
  remarks: string;
  receivedBy: string | null;
  receivedAt: string | null;
  cancelReason: string | null;
  canReceive: boolean;
  canCancel: boolean;
}

export interface PurchaseOption {
  id: string;
  code: string;
  name: string;
  hsnCode?: string | null;
  vendorId: number | null;
  unitPrice: number;
  gstPercent: number;
}

export interface LineTotals {
  subTotal: number;
  gst: number;
  grandTotal: number;
}

export function lineTotals(items: Pick<PurchaseLineItem, 'unitPrice' | 'gstPercent' | 'requestedQty'>[]): LineTotals {
  const subTotal = items.reduce((sum, i) => sum + i.unitPrice * i.requestedQty, 0);
  const gst = items.reduce((sum, i) => sum + (i.unitPrice * i.requestedQty * i.gstPercent) / 100, 0);
  return { subTotal, gst, grandTotal: subTotal + gst };
}

/** Status -> badge colour used by the purchase dialogs. */
export function statusTone(status: string): 'green' | 'orange' | 'red' | 'blue' | 'grey' {
  if (['Approved', 'Received', 'Posted', 'Adjusted', 'In Stock'].includes(status)) return 'green';
  if (['Pending', 'Partially Received', 'In Transit', 'Open', 'Low Stock'].includes(status)) return 'orange';
  if (['Rejected', 'Cancelled', 'Out of Stock'].includes(status)) return 'red';
  if (['Ordered'].includes(status)) return 'blue';
  return 'grey';
}

export function inr(value: number): string {
  return `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function displayDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
