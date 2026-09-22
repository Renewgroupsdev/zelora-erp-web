import { Component } from '@angular/core';

/**
 * Shared decorative background (botanical corner art, waves, medical-plus pattern)
 * used behind the splash, login and forgot-password screens so all three stay in
 * sync — edit it once here instead of three near-identical copies.
 */
@Component({
  selector: 'app-auth-background',
  standalone: true,
  templateUrl: './auth-background.html',
  styleUrl: './auth-background.scss',
})
export class AuthBackground {}
