import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, expand, map, of, reduce } from 'rxjs';
import { ApiDataService } from './api-data.service';
import { ApiRoutesConstants } from './api-route-constants';

export type RecordStatus = 'Active' | 'Inactive';

export interface VendorRecord {
  id: number;
  code: string;
  name: string;
  address: string;
  gst_no: string;
  phone: string;
  email: string;
  status: RecordStatus;
  products_count: number;
}

export interface ProductRecord {
  /** Encrypted id - use as-is in URLs. */
  id: string;
  code: string;
  name: string;
  description: string | null;
  vendor_id: number | null;
  vendor: { id: number; name: string } | null;
  purchase_price: number | string;
  margin_percent: number | string;
  selling_price: number | string;
  discount_percent: number | string;
  discount_amount: number | string;
  gst_percent: number | string;
  gst_amount: number | string;
  total_amount: number | string;
  status: RecordStatus;
}

export interface ProductPayload {
  name: string;
  description: string;
  vendor_id: number;
  purchase_price: number;
  margin_percent: number;
  discount_percent: number;
  gst_percent: number;
  status: RecordStatus;
}

export interface VendorPayload {
  name: string;
  address: string;
  gst_no: string;
  phone: string;
  email: string;
  status: RecordStatus;
}

export interface ListQuery {
  page: number;
  perPage: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  status?: RecordStatus | null;
  vendorId?: number | null;
}

export interface PricingPreviewRequest {
  purchase_price: number;
  margin_percent: number;
  discount_percent: number;
  gst_percent: number;
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly api = inject(ApiDataService);

  // ---- Products ----
  listProducts(query: ListQuery): Observable<any> {
    return this.api.GET(`${ApiRoutesConstants.PRODUCT_GET_List}?${this.toParams(query, 'status')}`);
  }

  createProduct(payload: ProductPayload): Observable<any> {
    return this.api.POST(ApiRoutesConstants.PRODUCT_ADD, payload);
  }

  updateProduct(id: string, payload: ProductPayload): Observable<any> {
    return this.api.PUT(`${ApiRoutesConstants.PRODUCT_ADD}/${id}`, payload);
  }

  /** Server-side pricing preview (selling price, GST amount, total) - nothing is saved. */
  calculatePricing(request: PricingPreviewRequest): Observable<any> {
    return this.api.POST(`${ApiRoutesConstants.PRODUCT_ADD}/calculate-pricing`, request);
  }

  deleteProduct(id: string): Observable<any> {
    return this.api.Delete(`${ApiRoutesConstants.PRODUCT_DELETE}/${id}`, {});
  }

  // ---- Vendors ----
  listVendors(query: ListQuery): Observable<any> {
    return this.api.GET(`${ApiRoutesConstants.VENDOR_GET_List}?${this.toParams(query, 'status')}`);
  }

  createVendor(payload: VendorPayload): Observable<any> {
    return this.api.POST(ApiRoutesConstants.VENDOR_ADD, payload);
  }

  updateVendor(id: number, payload: VendorPayload): Observable<any> {
    return this.api.PUT(`${ApiRoutesConstants.VENDOR_ADD}/${id}`, payload);
  }

  deleteVendor(id: number): Observable<any> {
    return this.api.Delete(`${ApiRoutesConstants.VENDOR_DELETE}/${id}`, {});
  }

  /** Every active vendor (for dropdowns/filters), walking the paginated `data[]` + `pagination` envelope. */
  vendorOptions(): Observable<{ id: number; name: string }[]> {
    const fetchPage = (page: number) =>
      this.api.GET(`${ApiRoutesConstants.VENDOR_GET_List}?status=Active&per_page=100&page=${page}`) as Observable<any>;

    return fetchPage(1).pipe(
      expand((res: any) => {
        const current = Number(res?.pagination?.current_page ?? 1);
        const last = Number(res?.pagination?.last_page ?? 1);
        return current < last ? fetchPage(current + 1) : EMPTY;
      }),
      reduce((all: { id: number; name: string }[], res: any) => [
        ...all,
        ...((res?.data ?? []) as any[]).map(v => ({ id: v.id, name: v.name })),
      ], [] as { id: number; name: string }[]),
      catchError(() => of([])),
    );
  }

  private toParams(query: ListQuery, statusKey: string): string {
    const params = new URLSearchParams({ page: String(query.page), per_page: String(query.perPage) });
    if (query.search) params.set('search', query.search);
    if (query.sortBy) params.set('sort_by', query.sortBy);
    if (query.sortDirection) params.set('sort_direction', query.sortDirection);
    if (query.status) params.set(statusKey, query.status);
    if (query.vendorId) params.set('vendor_id', String(query.vendorId));
    return params.toString();
  }
}
