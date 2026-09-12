import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Preloader } from '../preloader/preloader';
import { Router } from '@angular/router';

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

  constructor(private fb: FormBuilder, private router: Router) { }

  ngOnInit(): void {

    this.loginForm = this.fb.group({
      user_name: ['', Validators.required],
      password: ['', Validators.required],
    });

  }

  get formValues() { return this.loginForm.controls; }

  Onsubmit() {
    this.formSubmitted = true;
    this.error = '';

    if (this.loginForm.invalid) {
      this.error = 'Please enter your user name and password.';
      return;
    }

    const username = this.loginForm.get('user_name')?.value;
    const password = this.loginForm.get('password')?.value;

    if(username != 'admin' || password != 'password123'){
        this.error = 'Invalid user name and password.';
        return;
    }

    this.loading = true;

    setTimeout(() => {
      this.loading = false;
      this.router.navigate(['/app/dashboard']);
    }, 1800);
  }

  clearError() {
    this.error = '';
  }

}
