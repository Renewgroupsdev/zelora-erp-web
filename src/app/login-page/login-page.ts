import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Preloader } from '../preloader/preloader';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth/auth.service';
import { CookieService } from '../shared/common-services/cookie.service';
import { AuthBackground } from '../shared/components/auth-background/auth-background';
import { firstModulePath } from '../shared/models/permission.model';
import { LoginResponse } from '../core/auth/auth.model';

const REMEMBER_ME_DAYS = 30;
const OTP_RESEND_SECONDS = 30;

export type LoginMode = 'user' | 'employee' | 'customer';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [Preloader, CommonModule, ReactiveFormsModule, FormsModule, AuthBackground],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage implements OnInit, OnDestroy {

  loginForm!: FormGroup;
  formSubmitted: boolean = false;
  showPassword: boolean = false;
  error: string = '';
  loading: boolean = false;

  /** user = email/phone + password (users), employee = employee ID + password (hr_employees), customer = mobile + OTP (customers). */
  mode: LoginMode = 'user';
  otpSent = false;
  info = '';
  resendIn = 0;
  private resendTimer?: ReturnType<typeof setInterval>;

  private readonly rememberMeKey = environment.rememberMeKey;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private cookieService: CookieService,
  ) { }

  ngOnInit(): void {

    this.loginForm = this.fb.group({
      user_name: ['', Validators.required],
      password: [''],
      otp: [''],
      rememberMe: [false],
    });

    this.restoreRememberedUser();
  }

  ngOnDestroy(): void {
    clearInterval(this.resendTimer);
  }

  get formValues() { return this.loginForm.controls; }

  private restoreRememberedUser(): void {
    const rememberedData = JSON.parse(this.cookieService.get(this.rememberMeKey) || 'null');

    if(!rememberedData) {
      return;
    }

    if (rememberedData.user_name) {
          this.loginForm.patchValue({
            user_name: rememberedData.user_name,
            password: rememberedData.password || '',
            rememberMe: true,
            });
    }
  }

  private processRememberMe(username: string, password: string, rememberMe: boolean): void {
    if (rememberMe) {
      const loginData = { user_name: username, password: password };
      this.cookieService.set(this.rememberMeKey, JSON.stringify(loginData), REMEMBER_ME_DAYS);
    } else {
      this.cookieService.remove(this.rememberMeKey);
    }
  }

  setMode(mode: LoginMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.error = '';
    this.info = '';
    this.otpSent = false;
    this.formSubmitted = false;
    this.loginForm.patchValue({ user_name: '', password: '', otp: '' });
    if (mode === 'user') this.restoreRememberedUser();
  }

  get identifierLabel(): string {
    return this.mode === 'employee' ? 'Employee ID' : this.mode === 'customer' ? 'Mobile Number' : 'User Name';
  }

  get identifierPlaceholder(): string {
    return this.mode === 'employee' ? 'Enter your employee ID (e.g. RP1001)' : this.mode === 'customer' ? 'Enter your 10-digit mobile number' : 'Enter your user name';
  }

  /** Customer step 1: send the OTP to the mobile number. */
  sendOtp(): void {
    this.formSubmitted = true;
    this.error = '';
    this.info = '';
    const phone = String(this.loginForm.get('user_name')?.value ?? '').trim();
    if (!/^[0-9]{10,15}$/.test(phone)) {
      this.error = 'Enter a valid mobile number.';
      return;
    }
    this.loading = true;
    this.authService.sendCustomerOtp(phone).subscribe({
      next: (response) => {
        this.loading = false;
        this.otpSent = true;
        this.formSubmitted = false;
        this.info = response.message || 'OTP sent to your mobile number.';
        this.startResendTimer();
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Unable to send the OTP. Please try again.';
      },
    });
  }

  private startResendTimer(): void {
    clearInterval(this.resendTimer);
    this.resendIn = OTP_RESEND_SECONDS;
    this.resendTimer = setInterval(() => {
      this.resendIn -= 1;
      if (this.resendIn <= 0) clearInterval(this.resendTimer);
    }, 1000);
  }

  Onsubmit() {
    if (this.mode === 'customer') return this.otpSent ? this.verifyOtp() : this.sendOtp();
    this.formSubmitted = true;
    this.error = '';

    const missing = !this.loginForm.get('user_name')?.value?.trim() || !this.loginForm.get('password')?.value;
    if (missing) {
      this.error = this.mode === 'employee' ? 'Please enter your employee ID and password.' : 'Please enter your user name and password.';
      return;
    }

    const username = this.loginForm.get('user_name')?.value;
    const password = this.loginForm.get('password')?.value;
    const rememberMe = this.loginForm.get('rememberMe')?.value;

    this.loading = true;

    const request$ = this.mode === 'employee' ? this.authService.loginEmployee(username.trim(), password) : this.authService.login(username, password);

    request$.subscribe({
      next: (response) => this.onSignedIn(response, username, password, rememberMe),
      error: (err) => this.onSignInFailed(err),
    });
  }

  /** Customer step 2: check the OTP. */
  private verifyOtp(): void {
    this.formSubmitted = true;
    this.error = '';
    const phone = String(this.loginForm.get('user_name')?.value ?? '').trim();
    const otp = String(this.loginForm.get('otp')?.value ?? '').trim();
    if (!/^[0-9]{6}$/.test(otp)) {
      this.error = 'Enter the 6-digit OTP.';
      return;
    }
    this.loading = true;
    this.authService.verifyCustomerOtp(phone, otp).subscribe({
      next: (response) => this.onSignedIn(response, phone, '', false),
      error: (err) => this.onSignInFailed(err),
    });
  }

  private onSignedIn(response: LoginResponse, username: string, password: string, rememberMe: boolean): void {
    this.loading = false;

    if (!response.success || !response.data) {
      this.error = response.message || 'Invalid credentials.';
      return;
    }

    if (this.mode === 'user') this.processRememberMe(username, password, rememberMe);

    const landingPath = firstModulePath(this.authService.menus()) ?? '/app/dashboard';
    this.router.navigateByUrl(landingPath);
  }

  private onSignInFailed(err: any): void {
    this.loading = false;
    this.error = err?.error?.message || 'Unable to login. Please try again.';
  }

  clearError() {
    this.error = '';
  }

  goToForgotPassword() {
    this.router.navigate(['/login/forgot-password']);
  }

}
