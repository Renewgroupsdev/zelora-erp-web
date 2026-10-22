import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { EMPTY, Observable, catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ScopeHeaderStore } from '../../shared/common-services/scope-header.store';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  const isApiRequest = authService.isApiUrl(req.url);
  const isAuthEndpoint = authService.isAuthEndpoint(req.url);
  const attachAuth = isApiRequest && !isAuthEndpoint;

  // Header branch / franchise filter (BranchContextService) - only on authenticated API calls.
  const scopeHeaders = attachAuth ? inject(ScopeHeaderStore).headers() : null;
  const scopedReq = scopeHeaders ? req.clone({ setHeaders: scopeHeaders }) : req;
  const authorizedReq = attachAuth ? withAuthHeader(scopedReq, authService) : req;

  return next(authorizedReq).pipe(
    catchError(error => {
      // The session already ended (idle timeout / sign-out): requests still in flight must fail quietly,
      // otherwise a page's own error popup ("Failed to load ...") lands on top of the login screen.
      if (attachAuth && !authService.isAuthenticated()) {
        return EMPTY;
      }
      if (error instanceof HttpErrorResponse && error.status === 401 && attachAuth) {
        return handleUnauthorized(authService);
      }
      return throwError(() => error);
    })
  );
};

function withAuthHeader(req: HttpRequest<unknown>, authService: AuthService): HttpRequest<unknown> {
  const authHeader = authService.getAuthorizationHeader();
  return authHeader ? req.clone({ setHeaders: { Authorization: authHeader } }) : req;
}

/**
 * 401 on an authenticated call = the session is over: clear it and go to the login page. The refresh-token
 * API is deliberately not called. Requests still in flight then hit the `!isAuthenticated()` check above and
 * fail quietly, so only the first 401 triggers the redirect.
 */
function handleUnauthorized(authService: AuthService): Observable<HttpEvent<unknown>> {
  authService.logout();
  return EMPTY; // the redirect to the login page is the message; no page-level error popup
}
