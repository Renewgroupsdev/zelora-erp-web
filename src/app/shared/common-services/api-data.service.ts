import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders } from '@angular/common/http';
import { map } from 'rxjs/operators';
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