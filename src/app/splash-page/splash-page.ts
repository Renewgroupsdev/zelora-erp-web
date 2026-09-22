import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/service/auth.service';
import { AuthBackground } from '../shared/components/auth-background/auth-background';

@Component({
  selector: 'app-splash-page',
  standalone: true,
  imports: [RouterLink, AuthBackground],
  templateUrl: './splash-page.html',
  styleUrl: './splash-page.scss',
})
export class SplashPage implements OnInit {

  constructor(private router: Router, private authService: AuthService) { }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/app/dashboard']);
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
