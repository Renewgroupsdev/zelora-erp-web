import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-splash-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './splash-page.html',
  styleUrl: './splash-page.scss',
})
export class SplashPage {

  constructor(private router: Router) { }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
