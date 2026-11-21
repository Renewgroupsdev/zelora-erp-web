import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from './api-route-constants';

/** One group of the Task type dropdown: the bold parent and its selectable task types. */
export interface TaskTypeGroup {
  id: number;
  name: string;
  children: { id: number; name: string }[];
}

/** The Task type master (Settings -> Task Type Module, GET /task-types/options) for one department. */
@Injectable({ providedIn: 'root' })
export class TaskTypeOptionsService {
  private readonly api = inject(ApiDataService);

  /** Active groups and task types of a department (by name); an unknown department or a failed call gives []. */
  forDepartment(department: string): Observable<TaskTypeGroup[]> {
    if (!department) return of([]);
    return (this.api.GET(`${ApiRoutesConstants.TASK_TYPE_OPTIONS}?department=${encodeURIComponent(department)}`) as Observable<any>).pipe(
      map(res => (res?.data ?? []) as TaskTypeGroup[]),
      catchError(() => of([])),
    );
  }
}
