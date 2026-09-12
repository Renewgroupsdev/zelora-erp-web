import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./splash-page/splash-page').then(m => m.SplashPage),
  },
  {
    path: 'login',
    loadChildren: () => import('./login-page-module/login-page-module-module').then(m => m.LoginPageModuleModule),
  },
  {
    path: 'app',
    loadComponent: () => import('./layout/layout').then(m => m.Layout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'lead-management', loadComponent: () => import('./pages/lead-management/lead-management').then(m => m.LeadManagement) },
      { path: 'follow-ups', loadComponent: () => import('./pages/followups/followups').then(m => m.Followups) },
      { path: 'schedule', loadComponent: () => import('./pages/schedule/schedule').then(m => m.Schedule) },
      { path: 'appointments', loadComponent: () => import('./pages/appointment-page/appointment-page').then(m => m.AppointmentPage) },
      { path: 'customers', loadComponent: () => import('./pages/customer-portal-page/customer-portal-page').then(m => m.CustomerPortalPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings-page/settings-page').then(m => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
