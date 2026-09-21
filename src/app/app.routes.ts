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
      { path: 'masters/service-category', loadComponent: () => import('./pages/look-up-master/service-category/service-category').then(m => m.ServiceCategory) },
      { path: 'masters/source', loadComponent: () => import('./pages/look-up-master/source/source').then(m => m.Source) },
      { path: 'masters/lead-status', loadComponent: () => import('./pages/look-up-master/lead-status/lead-status').then(m => m.LeadStatus) },
      { path: 'masters/roles', loadComponent: () => import('./pages/look-up-master/roles/roles').then(m => m.Roles) },
      { path: 'appointments', loadComponent: () => import('./pages/appointment-page/appointment-page').then(m => m.AppointmentPage) },
      { path: 'customers', loadComponent: () => import('./pages/customer-portal-page/customer-portal-page').then(m => m.CustomerPortalPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings-page/settings-page').then(m => m.SettingsPage) },
      
    ],
  },
  { path: '**', redirectTo: '' },
];
