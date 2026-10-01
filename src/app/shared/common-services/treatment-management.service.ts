import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, expand, map, of, reduce } from 'rxjs';
import { ApiDataService } from './api-data.service';
import { ApiRoutesConstants } from './api-route-constants';

export type DiscountType = 'percentage' | 'fixed';

export interface TreatmentMaterialRow {
  /** Product reference (null if the product was since deleted). */
  product_id: number | null;
  name: string;
  unit: string;
  quantity: number | string;
}

export interface TreatmentComboRow {
  name: string;
  price: number | string;
}

export interface TreatmentRecord {
  /** Encrypted id - use as-is in URLs. */
  id: string;
  name: string;
  description: string;
  category: { id: number; name: string } | null;
  branch: { id: number; name: string } | null;
  is_combo: boolean;
  materials: TreatmentMaterialRow[];
  combo_items: TreatmentComboRow[];
  amount: number | string;
  discount_type: DiscountType;
  discount: number | string;
  gst_rate: number | string;
  gst: number | string;
  total_amount: number | string;
  default_sittings: number;
  is_active: boolean;
}

export interface TreatmentPayload {
  treatment_category_id: number;
  branch_id: number;
  name: string;
  description: string;
  amount: number;
  discount_type: DiscountType;
  discount: number;
  gst_rate: number;
  default_sittings: number;
  is_active: boolean;
  materials: { product_id: number; unit: string; quantity: number }[];
  combo_items: { name: string; price: number }[];
}

export interface TreatmentListQuery {
  page: number;
  perPage: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  categoryId?: number | null;
  branchId?: number | null;
  isActive?: boolean | null;
}

export interface LookupOption {
  id: number | string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class TreatmentManagementService {
  private readonly api = inject(ApiDataService);

  list(query: TreatmentListQuery): Observable<any> {
    const params = new URLSearchParams({ page: String(query.page), per_page: String(query.perPage) });
    if (query.search) params.set('search', query.search);
    if (query.sortBy) params.set('sort_by', query.sortBy);
    if (query.sortDirection) params.set('sort_direction', query.sortDirection);
    if (query.categoryId) params.set('treatment_category_id', String(query.categoryId));
    if (query.branchId) params.set('branch_id', String(query.branchId));
    if (query.isActive !== null && query.isActive !== undefined) params.set('is_active', query.isActive ? '1' : '0');
    return this.api.GET(`${ApiRoutesConstants.TREATMENT_GET_List}?${params.toString()}`);
  }

  get(id: string): Observable<any> {
    return this.api.GET(`${ApiRoutesConstants.TREATMENT_GET_List}/${id}`);
  }

  create(payload: TreatmentPayload): Observable<any> {
    return this.api.POST(ApiRoutesConstants.TREATMENT_ADD, payload);
  }

  update(id: string, payload: TreatmentPayload): Observable<any> {
    return this.api.PUT(`${ApiRoutesConstants.TREATMENT_ADD}/${id}`, payload);
  }

  remove(id: string): Observable<any> {
    return this.api.Delete(`${ApiRoutesConstants.TREATMENT_DELETE}/${id}`, {});
  }

  /** Active categories (Laravel paginator: data.data). One of them is named "Combo". */
  categories(): Observable<LookupOption[]> {
    return this.api.GetAllPages(`${ApiRoutesConstants.TREATMENT_CATEGORY_OPTIONS}?status=1&per_page=100`).pipe(
      // The service-category list holds categories and their sub-treatments; only top-level rows are categories.
      map((rows: any[]) => rows.filter(r => r.parent_id === null || r.parent_id === undefined).map(r => ({ id: r.id, name: r.name }))),
      catchError(() => of([])),
    );
  }

  /** Active products for the Consumables / materials dropdown (custom envelope: data[] + pagination). */
  products(): Observable<LookupOption[]> {
    const fetchPage = (page: number) =>
      this.api.GET(`${ApiRoutesConstants.TREATMENT_PRODUCT_OPTIONS}?status=Active&per_page=100&page=${page}`) as Observable<any>;

    return fetchPage(1).pipe(
      expand((res: any) => {
        const current = Number(res?.pagination?.current_page ?? 1);
        const last = Number(res?.pagination?.last_page ?? 1);
        return current < last ? fetchPage(current + 1) : EMPTY;
      }),
      reduce((all: LookupOption[], res: any) => [
        ...all,
        ...((res?.data ?? []) as any[]).map(p => ({ id: p.product_ref, name: p.name })),
      ], [] as LookupOption[]),
      catchError(() => of([])),
    );
  }

  branches(): Observable<LookupOption[]> {
    return this.api.GetAllPages(`${ApiRoutesConstants.Branch_List_Options}?per_page=100`).pipe(
      map((rows: any[]) => rows.map(r => ({ id: r.id, name: r.name }))),
      catchError(() => of([])),
    );
  }
}
