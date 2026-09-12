import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LoginPageModuleRoutingModule } from './login-page-module-routing-module';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { LoginPage } from '../login-page/login-page';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    LoginPage,
    ReactiveFormsModule,
    FormsModule,
    LoginPageModuleRoutingModule
  ]
})
export class LoginPageModuleModule { }
