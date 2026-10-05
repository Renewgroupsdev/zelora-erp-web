/** Purchase Management - request -> branch-head approval -> PO + invoice -> batch-wise inward -> central/branch stock. */

export type PurchaseRequestStatus = 'Pending' | 'Approved' | 'Rejected';
export type PurchaseOrderStatus = 'Ordered' | 'Partially Received' | 'Received';
export type VendorNoteType = 'Credit Note' | 'Debit Note';
export type VendorNoteStatus = 'Open' | 'Adjusted';
export type Priority = 'Low' | 'Normal' | 'Urgent';

/** Stock below this count raises a low-stock alert to the branch head. */
export const LOW_STOCK_THRESHOLD = 10;
export const CENTRAL_STORE = 'Central Store';

export interface PurchaseLineItem {
  productId: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  gstPercent: number;
  requestedQty: number;
  /** Total accepted into stock so far across every inward against the PO. */
  receivedQty: number;
  /** Auto-generated when the request is approved and the PO is raised (empty on a request). */
  batchNo?: string;
}

export interface PurchaseRequest {
  id: string;
  requestNo: string;
  branch: string;
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
  unitPrice: number;
}

export interface GoodsInward {
  id: string;
  grnNo: string;
  poId: string;
  poNo: string;
  vendorName: string;
  store: string;
  receivedBy: string;
  receivedAt: string;
  vendorInvoiceNo: string;
  lines: InwardLine[];
  /** Partial when any PO line is still short after this inward. */
  isPartial: boolean;
  noteId?: string;
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
  reason: PurchaseReturnReason;
  remarks: string;
  lines: PurchaseReturnLine[];
  returnedBy: string;
  returnedAt: string;
  noteId?: string;
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
  reason: string;
  amount: number;
  createdAt: string;
  status: VendorNoteStatus;
}

export interface StockBatch {
  id: string;
  store: string;
  productId: string;
  productCode: string;
  productName: string;
  batchNo: string;
  expiryDate: string | null;
  qty: number;
  unitPrice: number;
}

export interface StockTransfer {
  id: string;
  transferNo: string;
  fromStore: string;
  toStore: string;
  productName: string;
  batchNo: string;
  qty: number;
  transferredBy: string;
  transferredAt: string;
  remarks: string;
}

export interface PurchaseOption {
  id: string;
  code: string;
  name: string;
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

export function inr(value: number): string {
  return `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function displayDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
