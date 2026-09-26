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
      { path: 'masters/service-category', loadComponent: () => import('./pages/look-up-master/service-category/service-category').then(m => m.ServiceCategory) },
      { path: 'masters/source', loadComponent: () => import('./pages/look-up-master/source/source').then(m => m.Source) },
      { path: 'masters/lead-status', loadComponent: () => import('./pages/look-up-master/lead-status/lead-status').then(m => m.LeadStatus) },
      { path: 'masters/roles', loadComponent: () => import('./pages/look-up-master/roles/roles').then(m => m.Roles) },
      { path: 'masters/roles-and-permission', loadComponent: () => import('./pages/look-up-master/roles-permission/roles-permission').then(m => m.RolesPermission) },
      { path: 'masters/roles-and-permission/add', loadComponent: () => import('./pages/look-up-master/roles-permission/add-roles-permission-form/add-roles-permission-form').then(m => m.AddRolesPermissionForm) },
      { path: 'masters/roles-and-permission/edit/:id', loadComponent: () => import('./pages/look-up-master/roles-permission/add-roles-permission-form/add-roles-permission-form').then(m => m.AddRolesPermissionForm) },
      { path: 'masters/roles-and-permission/assign', loadComponent: () => import('./pages/look-up-master/roles-permission/role-permission-matrix/role-permission-matrix').then(m => m.RolePermissionMatrix) },
      { path: 'appointments', loadComponent: () => import('./pages/appointment-page/appointment-page').then(m => m.AppointmentPage) },
      { path: 'customers', loadComponent: () => import('./pages/customer-portal-page/customer-portal-page').then(m => m.CustomerPortalPage) },
      { path: 'treatments', loadComponent: () => import('./pages/treatment-management/treatment-management').then(m => m.TreatmentManagement) },
      { path: 'treatments/create', loadComponent: () => import('./pages/treatment-management/treatment-create').then(m => m.TreatmentCreate) },
      { path: 'inventory', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'hr-management', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
      { path: 'reports', loadComponent: () => import('./pages/reports/reports').then(m => m.Reports) },
      { path: 'reports/:id', loadComponent: () => import('./pages/reports/report-detail/report-detail').then(m => m.ReportDetail) },
      { path: 'settings', loadComponent: () => import('./pages/settings-page/settings-page').then(m => m.SettingsPage) },
      
    ],
  },
  { path: '**', redirectTo: '' },
];
