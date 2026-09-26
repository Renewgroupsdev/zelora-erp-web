import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Preloader } from '../preloader/preloader';
import { AuthBackground } from '../shared/components/auth-background/auth-background';
import { AuthService } from '../core/auth/auth.service';

/** Flags the group invalid (via a `mismatch` error) whenever the two password fields differ. */
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmation = group.get('password_confirmation')?.value;
  return password && confirmation && password !== confirmation ? { mismatch: true } : null;
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [Preloader, CommonModule, ReactiveFormsModule, FormsModule, AuthBackground],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {

  resetForm!: FormGroup;
  formSubmitted = false;
  error = '';
  successMessage = '';
  loading = false;
  showPassword = false;
  showConfirmPassword = false;

  private token = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
  ) { }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';

    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      password_confirmation: ['', Validators.required],
    }, { validators: passwordsMatchValidator });

    if (!this.token) {
      this.error = 'This reset link is invalid or has expired. Please request a new one.';
    }
  }

  get formValues() { return this.resetForm.controls; }

  onSubmit(): void {
    this.formSubmitted = true;
    this.error = '';
    this.successMessage = '';

    if (!this.token) {
      this.error = 'This reset link is invalid or has expired. Please request a new one.';
      return;
    }

    if (this.resetForm.invalid) {
      this.error = this.resetForm.errors?.['mismatch']
        ? 'New password and confirm password do not match.'
        : 'Please fill in both password fields.';
      return;
    }

    const { password, password_confirmation } = this.resetForm.value;
    this.loading = true;

    this.authService.resetPassword({
      data: this.token,
      password,
      password_confirmation,
    }).subscribe({
      next: (response) => {
        this.loading = false;

        if (!response?.success) {
          this.error = response?.message || 'Unable to reset password. Please try again.';
          return;
        }

        this.successMessage = response.message || 'Your password has been reset successfully.';

        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 1500);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Unable to reset password. Please try again.';
      },
    });
  }

  clearError(): void {
    this.error = '';
  }

  backToLogin(): void {
    this.router.navigate(['/login']);
  }
}
