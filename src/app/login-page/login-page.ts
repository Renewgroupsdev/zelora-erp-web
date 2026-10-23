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
const OTP_RESEND_SECONDS = 59;
const OTP_LENGTH = 6;

export type LoginMode = 'user' | 'employee' | 'customer';

/** What the single sign-in field holds: an email, a mobile number, an employee ID, or nothing yet. */
export type IdentifierKind = 'email' | 'phone' | 'employee' | 'none';

/** Digits of a mobile number typed as "98765 43210", "+91-98765-43210", ...; null when it is not a mobile number. */
export function mobileDigits(value: string): string | null {
  const v = value.trim();
  if (!/^\+?[0-9][0-9\s-]*$/.test(v)) return null;
  let digits = v.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2); // +91 country code
  return /^[0-9]{10,15}$/.test(digits) ? digits : null;
}

/** Management accounts sign in with their email (or phone), employees with their employee ID, customers with a mobile number. */
export function identifierKind(value: string): IdentifierKind {
  const v = value.trim();
  if (!v) return 'none';
  if (v.includes('@')) return 'email';
  if (mobileDigits(v)) return 'phone';
  return /^\+?[0-9\s-]+$/.test(v) ? 'none' : 'employee'; // a half-typed number is not an employee ID
}

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

  /**
   * One field for everybody; what is typed picks the sign-in:
   *   email                      -> management account (users) + password
   *   mobile number              -> customer OTP, or the management account's password when usePassword is on
   *                                 (staff can sign in with their phone number too)
   *   anything else              -> employee ID (hr_employees) + password
   */
  usePassword = false;
  otpSent = false;
  otpDigits: string[] = Array(OTP_LENGTH).fill('');
  readonly otpIndexes = Array.from({ length: OTP_LENGTH }, (_, i) => i);
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

    // Typing something else than a mobile number goes back to the default for the new value.
    this.loginForm.get('user_name')!.valueChanges.subscribe(() => {
      if (this.kind !== 'phone') this.usePassword = false;
      if (this.error) this.error = '';
      this.info = '';
    });
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

  private get identifier(): string {
    return String(this.loginForm.get('user_name')?.value ?? '');
  }

  get kind(): IdentifierKind {
    return identifierKind(this.identifier);
  }

  /** Which backend sign-in the typed value goes to. */
  get mode(): LoginMode {
    switch (this.kind) {
      case 'employee': return 'employee';
      case 'phone': return this.usePassword ? 'user' : 'customer';
      default: return 'user';
    }
  }

  /** Password field: everything except a mobile number on the OTP path. */
  get needsPassword(): boolean {
    return this.mode !== 'customer';
  }

  get identifierIcon(): string {
    return this.kind === 'phone' ? 'bi-phone' : this.kind === 'employee' ? 'bi-person-vcard' : 'bi-person';
  }

  /** Mobile number: OTP (customer) <-> password (management account registered with that number). */
  togglePasswordLogin(): void {
    this.usePassword = !this.usePassword;
    this.error = '';
    this.info = '';
    this.formSubmitted = false;
    this.loginForm.patchValue({ password: '' });
  }

  /** Customer step 1: send the OTP to the mobile number. */
  sendOtp(): void {
    this.formSubmitted = true;
    this.error = '';
    this.info = '';
    const phone = mobileDigits(this.identifier);
    if (!phone) {
      this.error = 'Enter a valid mobile number.';
      return;
    }
    this.loading = true;
    this.authService.sendCustomerOtp(phone).subscribe({
      next: (response) => {
        this.loading = false;
        this.otpSent = true;
        this.formSubmitted = false;
        this.resetOtpBoxes();
        setTimeout(() => this.focusOtpBox(0));
        this.info = response.message || 'OTP sent to your mobile number.';
        this.startResendTimer();
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Unable to send the OTP. Please try again.';
      },
    });
  }

  /** "00:59s" style countdown shown on the OTP screen. */
  get resendLabel(): string {
    return `00:${String(this.resendIn).padStart(2, '0')}s`;
  }

  private syncOtpControl(): void {
    this.loginForm.patchValue({ otp: this.otpDigits.join('') });
  }

  private focusOtpBox(index: number): void {
    (document.getElementById(`otp-${index}`) as HTMLInputElement | null)?.focus();
  }

  onOtpInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, '').slice(-1);
    input.value = digit;
    this.otpDigits[index] = digit;
    this.syncOtpControl();
    this.error = '';
    if (digit && index < OTP_LENGTH - 1) this.focusOtpBox(index + 1);
  }

  onOtpKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.otpDigits[index] && index > 0) {
      this.otpDigits[index - 1] = '';
      this.syncOtpControl();
      this.focusOtpBox(index - 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      this.focusOtpBox(index - 1);
    } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      this.focusOtpBox(index + 1);
    }
  }

  onOtpPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    this.otpDigits = Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] ?? '');
    this.syncOtpControl();
    this.focusOtpBox(Math.min(pasted.length, OTP_LENGTH - 1));
  }

  /** Cancel on the OTP screen: back to the mobile number step. */
  cancelOtp(): void {
    clearInterval(this.resendTimer);
    this.resendIn = 0;
    this.otpSent = false;
    this.info = '';
    this.error = '';
    this.resetOtpBoxes();
  }

  private resetOtpBoxes(): void {
    this.otpDigits = Array(OTP_LENGTH).fill('');
    this.syncOtpControl();
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

    if (this.kind === 'none') {
      this.error = 'Enter your email, employee ID or mobile number.';
      return;
    }
    if (!this.loginForm.get('password')?.value) {
      this.error = 'Please enter your password.';
      return;
    }

    // A mobile number typed with spaces / +91 is sent the way it is stored.
    const username = this.kind === 'phone' ? mobileDigits(this.identifier)! : this.identifier.trim();
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
    const phone = mobileDigits(this.identifier) ?? '';
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

    if (this.mode !== 'customer') this.processRememberMe(username, password, rememberMe);

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
