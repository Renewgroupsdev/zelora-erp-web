import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders } from '@angular/common/http';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiDataService {
  APIURL:string="";
  constructor(private http:HttpClient) { }

  GET(path:string):any{
    //this.APIURL=path;
    this.APIURL=`${environment.apiBaseUrl}${path}`;
    return this.http.get<any>(this.APIURL).pipe(map(result=>{
        return result;
    }));
  }

  /** Some list endpoints paginate (Laravel's paginate()) even when the caller wants the whole
   *  set at once - e.g. a parent/child tree breaks if a parent lands on page 2 while its
   *  children are on page 1. Walks every page via `last_page` and returns the flattened
   *  `data.data` rows from all of them. */
  GetAllPages(path: string): any {
    return this.GET(path).pipe(
      switchMap((firstResponse: any) => {
        const firstPage = firstResponse?.data;
        const rows: any[] = firstPage?.data ?? [];

        if (!firstResponse?.success || !Array.isArray(firstPage?.data)) {
          return of([]);
        }

        const lastPage = Number(firstPage?.last_page ?? 1);
        if (lastPage <= 1) {
          return of(rows);
        }

        const remainingPages = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
        return forkJoin(
          remainingPages.map((pageNumber) => this.GET(`${path}?page=${pageNumber}`))
        ).pipe(
          map((responses: any[]) => [
            ...rows,
            ...responses.flatMap((response: any) => response?.data?.data ?? []),
          ])
        );
      })
    );
  }

  /** File-download endpoints (exports) return a binary body, not JSON, so this bypasses
   *  the `map()` used above and returns the raw Blob for the caller to save. */
  GET_BLOB(path: string): any {
    this.APIURL = `${environment.apiBaseUrl}${path}`;
    return this.http.get(this.APIURL, { responseType: 'blob' });
  }

  POST(path:string,json:any):any{
    this.APIURL=`${environment.apiBaseUrl}${path}`;
    return this.http.post<any>(this.APIURL, json).pipe(map(result => {
          return result;
    }));
  }
  PUT(path:string,json:any):any{
    this.APIURL=`${environment.apiBaseUrl}${path}`;
    return this.http.put<any>(this.APIURL, json).pipe(map(result => {
          return result;
    }));
  }

  Delete(path: string, json: any): any {
    this.APIURL = `${environment.apiBaseUrl}${path}`;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
  
    return this.http.delete<any>(this.APIURL, { headers, body: json }).pipe(map(result => {
      return result;
    }));
  }
}