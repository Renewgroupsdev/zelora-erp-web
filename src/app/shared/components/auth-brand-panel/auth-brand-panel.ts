import { Component } from '@angular/core';

/** Left column of the pre-login screens: group logo, name and tagline. Hidden below 900px. */
@Component({
  selector: 'app-auth-brand-panel',
  standalone: true,
  templateUrl: './auth-brand-panel.html',
  styleUrl: './auth-brand-panel.scss',
})
export class AuthBrandPanel {}
