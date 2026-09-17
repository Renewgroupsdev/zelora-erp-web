import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Preloader } from '../preloader/preloader';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [Preloader, CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage implements OnInit {

  loginForm!: FormGroup;
  formSubmitted: boolean = false;
  showPassword: boolean = false;
  error: string = '';
  loading: boolean = false;

  private readonly rememberMeKey = environment.rememberMeKey;

  constructor(private fb: FormBuilder, private router: Router) { }

  ngOnInit(): void {

    this.loginForm = this.fb.group({
      user_name: ['', Validators.required],
      password: ['', Validators.required],
      rememberMe: [false],
    });

    this.restoreRememberedUser();
  }

  get formValues() { return this.loginForm.controls; }

  private restoreRememberedUser(): void {
    const rememberedData = JSON.parse(localStorage.getItem(this.rememberMeKey) || 'null');

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
      localStorage.setItem( this.rememberMeKey, JSON.stringify(loginData) );
    } else {
      localStorage.removeItem(this.rememberMeKey);
    }
  }

  Onsubmit() {
    this.formSubmitted = true;
    this.error = '';

    // if (this.loginForm.invalid) {
    //   this.error = 'Please enter your user name and password.';
    //   return;
    // }

    // const username = this.loginForm.get('user_name')?.value;
    // const password = this.loginForm.get('password')?.value;
    // const rememberMe = this.loginForm.get('rememberMe')?.value;

    // if (username != 'admin' || password != 'password123') {
    //   this.error = 'Invalid user name and password.';
    //   return;
    // }

    // this.processRememberMe(username, password, rememberMe);

    this.loading = true;

    setTimeout(() => {
      this.loading = false;
      this.router.navigate(['/app/dashboard']);
    }, 1800);
  }

  clearError() {
    this.error = '';
  }

  goToForgotPassword() {
    this.router.navigate(['/login/forgot-password']);
  }

}
