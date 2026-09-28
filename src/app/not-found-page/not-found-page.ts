import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { AuthBackground } from '../shared/components/auth-background/auth-background';
import { firstModulePath } from '../shared/models/permission.model';

@Component({
  selector: 'app-not-found-page',
  standalone: true,
  imports: [AuthBackground],
  templateUrl: './not-found-page.html',
  styleUrl: './not-found-page.scss',
})
export class NotFoundPage {
  constructor(private router: Router, private authService: AuthService) {}

  /** Signed-in users land back on a module they actually have; a guest goes to login instead
   *  of being told a route exists (this page also doubles as the authGuard's "not signed in"
   *  redirect target, so it must never assume the caller is logged in). */
  goHome(): void {
    if (this.authService.isAuthenticated()) {
      const landingPath = firstModulePath(this.authService.menus()) ?? '/app/dashboard';
      this.router.navigateByUrl(landingPath);
    } else {
      this.router.navigate(['/login']);
    }
  }
}
