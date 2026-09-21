import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiDataService } from '../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { AuthUser, LoginResponse, LoginResponseData } from '../auth/auth.model';
import { IdleService } from '../idle-service/idle.service';

const ACCESS_TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const TOKEN_TYPE_KEY = 'token_type';
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at';
const AUTH_USER_KEY = 'auth_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  readonly currentUser = signal<AuthUser | null>(this.readUser());
  readonly isAuthenticated = signal<boolean>(!!this.readAccessToken());

  constructor(
    private api: ApiDataService,
    private router: Router,
    private idleService: IdleService,
  ) {
    if (this.isAuthenticated()) {
      this.idleService.start(() => this.logout());
    }
  }

  login(username: string, password: string, deviceName = 'web'): Observable<LoginResponse> {
    return this.api
      .POST(ApiRoutesConstants.AUTH_LOGIN, { username, password, device_name: deviceName })
      .pipe(tap((response: LoginResponse) => this.handleAuthResponse(response)));
  }

  /** Exchanges the stored refresh token for a new access token. Used by the auth interceptor on 401s. */
  refreshAccessToken(): Observable<LoginResponse> {
    return this.api
      .POST(ApiRoutesConstants.AUTH_REFRESH, { refresh_token: this.readRefreshToken() })
      .pipe(tap((response: LoginResponse) => this.handleAuthResponse(response)));
  }

  logout(navigateToLogin = true): void {
    this.idleService.stop();
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_TYPE_KEY);
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    this.currentUser.set(null);
    this.isAuthenticated.set(false);

    if (navigateToLogin) {
      this.router.navigate(['/login']);
    }
  }

  getAccessToken(): string | null {
    return this.readAccessToken();
  }

  getRefreshToken(): string | null {
    return this.readRefreshToken();
  }

  getAuthorizationHeader(): string | null {
    const token = this.readAccessToken();
    if (!token) {
      return null;
    }
    const tokenType = localStorage.getItem(TOKEN_TYPE_KEY) || 'Bearer';
    return `${tokenType} ${token}`;
  }

  isApiUrl(url: string): boolean {
    return url.startsWith(environment.apiBaseUrl);
  }

  /** Login/refresh calls must skip the Authorization header and must never trigger a refresh-on-401 loop. */
  isAuthEndpoint(url: string): boolean {
    const loginUrl = `${environment.apiBaseUrl}${ApiRoutesConstants.AUTH_LOGIN}`;
    const refreshUrl = `${environment.apiBaseUrl}${ApiRoutesConstants.AUTH_REFRESH}`;
    return url === loginUrl || url === refreshUrl;
  }

  private handleAuthResponse(response: LoginResponse): void {
    if (response?.success && response.data) {
      // Never store a session without real tokens. Otherwise localStorage.setItem(key, undefined)
      // saves the string "undefined", which is truthy, so the app thinks the user is logged in
      // and sends "Authorization: Bearer undefined" on every request.
      if (!response.data.token || !response.data.refresh_token) {
        throw new Error('Auth response is missing access_token / refresh_token.');
      }
      this.persistSession(response.data);
    }
  }

  private persistSession(data: LoginResponseData): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.token);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    localStorage.setItem(TOKEN_TYPE_KEY, data.token_type || 'Bearer');

    const expiresIn = Number(data.expires_in);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + expiresIn * 1000));
    }

    // A refresh response may not include the user, so keep the existing one in that case.
    if (data.user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
      this.currentUser.set(data.user);
    }

    this.isAuthenticated.set(true);
    this.idleService.start(() => this.logout());
  }

  private readAccessToken(): string | null {
    return this.readStoredToken(ACCESS_TOKEN_KEY);
  }

  private readRefreshToken(): string | null {
    return this.readStoredToken(REFRESH_TOKEN_KEY);
  }

  /** Treats empty values and the broken literals "undefined" / "null" as "no token". */
  private readStoredToken(key: string): string | null {
    const value = localStorage.getItem(key);
    return value && value !== 'undefined' && value !== 'null' ? value : null;
  }

  private readUser(): AuthUser | null {
    try {
      return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
    } catch {
      return null;
    }
  }
}