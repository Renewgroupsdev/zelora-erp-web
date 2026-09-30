import { Injectable, inject } from '@angular/core';
import { Observable, catchError, expand, map, of, reduce, EMPTY } from 'rxjs';
import { ApiDataService } from './api-data.service';
import { ApiRoutesConstants } from './api-route-constants';

export interface TreatmentRecord {
  id: string;
  name: string;
  description: string;
  category: { id: number; name: string } | null;
  branch: { id: number; name: string } | null;
  product: { id: string; name: string } | null;
  needed_product_qty: number | null;
  amount: number;
  gst: number;
  total_amount: number;
  default_sittings: number;
  is_active: boolean;
}

export interface TreatmentPayload {
  treatment_category_id: number;
  branch_id: number;
  name: string;
  description: string;
  amount: number;
  gst: number;
  default_sittings: number;
  product_id: string;
  needed_product_qty: number | null;
  is_active: boolean;
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

  /** Active categories (Laravel paginator: data.data). */
  categories(): Observable<LookupOption[]> {
    return this.api.GetAllPages(`${ApiRoutesConstants.TREATMENT_CATEGORY_OPTIONS}?status=1&per_page=100`).pipe(
      map((rows: any[]) => rows.map(r => ({ id: r.id, name: r.name }))),
      catchError(() => of([])),
    );
  }

  branches(): Observable<LookupOption[]> {
    return this.api.GetAllPages(`${ApiRoutesConstants.Branch_List_Options}?per_page=100`).pipe(
      map((rows: any[]) => rows.map(r => ({ id: r.id, name: r.name }))),
      catchError(() => of([])),
    );
  }

  /** Active products (custom envelope: data[] + pagination), walked page by page. */
  products(): Observable<LookupOption[]> {
    const fetchPage = (page: number) =>
      this.api.GET(`${ApiRoutesConstants.TREATMENT_PRODUCT_OPTIONS}?is_active=1&per_page=100&page=${page}`) as Observable<any>;

    return fetchPage(1).pipe(
      expand((res: any) => {
        const current = Number(res?.pagination?.current_page ?? 1);
        const last = Number(res?.pagination?.last_page ?? 1);
        return current < last ? fetchPage(current + 1) : EMPTY;
      }),
      reduce((all: LookupOption[], res: any) => [
        ...all,
        ...((res?.data ?? []) as any[]).map(p => ({ id: p.id, name: p.name })),
      ], [] as LookupOption[]),
      catchError(() => of([])),
    );
  }
}
