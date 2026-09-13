import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LoginPageModuleRoutingModule } from './login-page-module-routing-module';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { LoginPage } from '../login-page/login-page';
import { ForgotPassword } from '../forgot-password/forgot-password';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    LoginPage,
    ForgotPassword,
    ReactiveFormsModule,
    FormsModule,
    LoginPageModuleRoutingModule
  ]
})
export class LoginPageModuleModule { }
