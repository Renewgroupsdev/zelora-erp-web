import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Preloader } from '../preloader/preloader';
import { AuthBackground } from '../shared/components/auth-background/auth-background';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [Preloader, CommonModule, ReactiveFormsModule, FormsModule, AuthBackground],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword implements OnInit {

  forgotForm!: FormGroup;
  formSubmitted: boolean = false;
  error: string = '';
  successMessage: string = '';
  loading: boolean = false;

  constructor(private fb: FormBuilder, private router: Router, private authService: AuthService) { }

  ngOnInit(): void {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  get formValues() { return this.forgotForm.controls; }

  onSubmit() {
    this.formSubmitted = true;
    this.error = '';
    this.successMessage = '';

    if (this.forgotForm.invalid) {
      this.error = 'Please enter a valid email address.';
      return;
    }

    const email = this.forgotForm.get('email')?.value;

    this.loading = true;

    this.authService.forgotPassword(email).subscribe({
      next: (response) => {
        this.loading = false;

        if (!response?.success) {
          this.error = response?.message || 'Unable to send reset link. Please try again.';
          return;
        }

        this.successMessage = response.message || `If an account exists for ${email}, a password reset link has been sent.`;

        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 1500);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Unable to send reset link. Please try again.';
      },
    });
  }

  clearError() {
    this.error = '';
  }

  backToLogin() {
    this.router.navigate(['/login']);
  }
}
