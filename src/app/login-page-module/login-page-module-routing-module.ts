import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginPage } from '../login-page/login-page';
import { ForgotPassword } from '../forgot-password/forgot-password';

const routes: Routes = [
  {
    path: '', 
    component : LoginPage,
  },
  {
    path: 'forgot-password',
    component: ForgotPassword,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LoginPageModuleRoutingModule { }
