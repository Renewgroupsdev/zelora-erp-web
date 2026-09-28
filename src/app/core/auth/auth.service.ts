import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiDataService } from '../http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { ApiResponse, AuthUser, LoginResponse, LoginResponseData, ResetPasswordPayload } from './auth.model';
import { IdleService } from '../idle-service/idle.service';
import { SidebarModule, flattenModuleSlugs } from '../../shared/models/permission.model';

const ACCESS_TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const TOKEN_TYPE_KEY = 'token_type';
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at';
const AUTH_USER_KEY = 'auth_user';
const MENUS_KEY = 'auth_menus';
const AUTH_PERMISSIONS_KEY = 'auth_permissions';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  readonly currentUser = signal<AuthUser | null>(this.readUser());
  readonly isAuthenticated = signal<boolean>(!!this.readAccessToken());
  readonly menus = signal<SidebarModule[]>(this.readMenus());
  readonly permissions = signal<SidebarModule[]>(this.readPermissions());

  constructor(
    private api: ApiDataService,
    private router: Router,
    private idleService: IdleService,
  ) {
    if (this.isAuthenticated()) {
      this.idleService.start(() => this.logout());
      // Always re-fetch on load (not just when the cache is empty) - an admin adding a module
      // in Roles & Permissions should see it appear on their next reload, not only after a
      // fresh login. The cached copy from readMenus() is still shown immediately in the
      // meantime so the sidebar isn't empty while this request is in flight.
      this.refreshMenus();
    }
  }

  login(username: string, password: string, deviceName = 'web'): Observable<LoginResponse> {
    return this.api
      .POST(ApiRoutesConstants.AUTH_LOGIN, { username, password, device_name: deviceName })
      .pipe(tap((response: LoginResponse) => this.handleAuthResponse(response)));
  }

  refreshAccessToken(): Observable<LoginResponse> {
    return this.api
      .POST(ApiRoutesConstants.AUTH_REFRESH, { refresh_token: this.readRefreshToken() })
      .pipe(tap((response: LoginResponse) => this.handleAuthResponse(response)));
  }

  loadPermissions(): Observable<SidebarModule[]> {
    return this.api.GET(ApiRoutesConstants.USER_ROLE_ACCESS).pipe(
      map((response: any) => (response?.data ?? []) as SidebarModule[]),
      tap((modules: SidebarModule[]) => this.applyPermissions(modules)),
      catchError(() => of([] as SidebarModule[])),
    );
  }

  private applyPermissions(modules: SidebarModule[]): void {
    localStorage.setItem(AUTH_PERMISSIONS_KEY, JSON.stringify(modules));
    this.permissions.set(modules);
  }

  hasModuleAccess(slugName: string): boolean {
    return flattenModuleSlugs(this.permissions()).has(slugName);
  }

  forgotPassword(email: string): Observable<ApiResponse<unknown>> {
    return this.api.POST(ApiRoutesConstants.AUTH_FORGOT_PASSWORD, { email });
  }

  resetPassword(payload: ResetPasswordPayload): Observable<ApiResponse<unknown>> {
    return this.api.POST(ApiRoutesConstants.AUTH_RESET_PASSWORD, payload);
  }

  logout(navigateToLogin = true): void {
    this.idleService.stop();
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_TYPE_KEY);
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(MENUS_KEY);
    localStorage.removeItem(AUTH_PERMISSIONS_KEY);
    this.currentUser.set(null);
    this.menus.set([]);
    this.permissions.set([]);
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

  isAuthEndpoint(url: string): boolean {
    const loginUrl = `${environment.apiBaseUrl}${ApiRoutesConstants.AUTH_LOGIN}`;
    const refreshUrl = `${environment.apiBaseUrl}${ApiRoutesConstants.AUTH_REFRESH}`;
    const forgotPasswordUrl = `${environment.apiBaseUrl}${ApiRoutesConstants.AUTH_FORGOT_PASSWORD}`;
    const resetPasswordUrl = `${environment.apiBaseUrl}${ApiRoutesConstants.AUTH_RESET_PASSWORD}`;
    return url === loginUrl || url === refreshUrl || url === forgotPasswordUrl || url === resetPasswordUrl;
  }

  private handleAuthResponse(response: LoginResponse): void {
    if (response?.success && response.data) {
      if (!response.data.token || !response.data.refresh_token) {
        throw new Error('Auth response is missing access_token / refresh_token.');
      }
      this.persistSession(response.data, response.Menus);
    }
  }

  private persistSession(data: LoginResponseData, menus?: SidebarModule[]): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.token);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    localStorage.setItem(TOKEN_TYPE_KEY, data.token_type || 'Bearer');

    const expiresIn = Number(data.expires_in);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + expiresIn * 1000));
    }

    if (data.user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
      this.currentUser.set(data.user);
    }

    if (menus) {
      localStorage.setItem(MENUS_KEY, JSON.stringify(menus));
      this.menus.set(menus);
      this.applyPermissions(menus);
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

  private readMenus(): SidebarModule[] {
    try {
      return JSON.parse(localStorage.getItem(MENUS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  private readPermissions(): SidebarModule[] {
    try {
      return JSON.parse(localStorage.getItem(AUTH_PERMISSIONS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  refreshMenus(): void {
    this.api.GET(ApiRoutesConstants.ROLES_PERMISSION_SIDEBAR).subscribe({
      next: (res: ApiResponse<AuthUser> & { Menus?: SidebarModule[] }) => {
        
        if (res?.Menus) {
          localStorage.setItem(MENUS_KEY, JSON.stringify(res.Menus));
          this.menus.set(res.Menus);
          this.applyPermissions(res.Menus);
        }
      },
      error: () => undefined,
    });
  }
}