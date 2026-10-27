import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiDataService } from './api-data.service';
import { DashRange, DashResponse, DashWidgetKey } from '../models/dashboard.model';

/**
 * Role based dashboard widgets: GET /api/dashboard/{widget}?range=... The auth interceptor adds the header branch /
 * franchise filter, so every figure follows the scope picked in the top bar (and the API holds a unit login to its unit).
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiDataService);

  widget<T>(key: DashWidgetKey, range: DashRange): Observable<DashResponse<T>> {
    return this.api.GET(`dashboard/${key}?range=${encodeURIComponent(range)}`).pipe(map((res: unknown) => res as DashResponse<T>));
  }
}
