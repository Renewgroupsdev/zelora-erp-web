import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { isTelecallerRole } from './auth.model';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // A signed-out visitor hitting a protected route sees the same 404 a bad URL would give them,
  // rather than a login redirect that confirms the route exists. /login itself stays reachable directly.
  return router.createUrlTree(['/404']);
};

/** Blocks plain telecallers from navigating straight to branch-wide call center views
 *  (branch alerts, telecaller roster) even if the tab is hidden - defense in depth for
 *  the *ngIf gating in CallCenter's nav. */
export const branchHeadGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!isTelecallerRole(authService.currentUser())) {
    return true;
  }

  return router.createUrlTree(['/app/call-center']);
};

export const loginRedirectGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return router.createUrlTree(['/app/dashboard']);
  }

  return true;
};
