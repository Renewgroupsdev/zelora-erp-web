import { Routes } from '@angular/router';
import { authGuard, loginRedirectGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./splash-page/splash-page').then(m => m.SplashPage),
  },
  {
    path: 'login',
    canActivate: [loginRedirectGuard],
    loadChildren: () => import('./login-page-module/login-page-module-module').then(m => m.LoginPageModuleModule),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout').then(m => m.Layout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'lead-management', loadComponent: () => import('./pages/lead-management/lead-management').then(m => m.LeadManagement) },
      { path: 'follow-ups', loadComponent: () => import('./pages/followups/followups').then(m => m.Followups) },
      { path: 'appointments', loadComponent: () => import('./pages/appointment-page/appointment-page').then(m => m.AppointmentPage) },
      { path: 'customers', loadComponent: () => import('./pages/customer-portal-page/customer-portal-page').then(m => m.CustomerPortalPage) },
      { path: 'treatments', loadComponent: () => import('./pages/treatment-management/treatment-management').then(m => m.TreatmentManagement) },
      { path: 'treatments/create', loadComponent: () => import('./pages/treatment-management/treatment-create').then(m => m.TreatmentCreate) },
      { path: 'inventory', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'hr-management', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'report', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'settings', loadComponent: () => import('./pages/settings-page/settings-page').then(m => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
