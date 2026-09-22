import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { AuthService } from '../service/auth.service';

// Module-level so it's shared across every request this interceptor handles,
// letting concurrent 401s wait on a single in-flight refresh instead of each firing their own.
let isRefreshing = false;
const refreshedToken$ = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  const isApiRequest = authService.isApiUrl(req.url);
  const isAuthEndpoint = authService.isAuthEndpoint(req.url);
  const attachAuth = isApiRequest && !isAuthEndpoint;

  const authorizedReq = attachAuth ? withAuthHeader(req, authService) : req;

  return next(authorizedReq).pipe(
    catchError(error => {
      if (error instanceof HttpErrorResponse && error.status === 401 && attachAuth) {
        return handleUnauthorized(authorizedReq, next, authService);
      }
      return throwError(() => error);
    })
  );
};

function withAuthHeader(req: HttpRequest<unknown>, authService: AuthService): HttpRequest<unknown> {
  const authHeader = authService.getAuthorizationHeader();
  return authHeader ? req.clone({ setHeaders: { Authorization: authHeader } }) : req;
}

function handleUnauthorized(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService
): Observable<HttpEvent<unknown>> {
  if (!authService.getRefreshToken()) {
    authService.logout();
    return throwError(() => new Error('Session expired. Please log in again.'));
  }

  if (!isRefreshing) {
    isRefreshing = true;
    refreshedToken$.next(null);

    return authService.refreshAccessToken().pipe(
      switchMap(() => {
        isRefreshing = false;
        const authHeader = authService.getAuthorizationHeader();
        refreshedToken$.next(authHeader);
        return next(withAuthHeader(req, authService));
      }),
      catchError(refreshError => {
        isRefreshing = false;
        authService.logout();
        return throwError(() => refreshError);
      })
    );
  }

  return refreshedToken$.pipe(
    filter((token): token is string => token !== null),
    take(1),
    switchMap(() => next(withAuthHeader(req, authService)))
  );
}
