import { Routes } from '@angular/router';
import { authGuard, branchHeadGuard, loginRedirectGuard } from './core/auth/auth.guard';

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
      {
        path: 'call-center',
        loadComponent: () => import('./features/call-center/call-center').then(m => m.CallCenter),
        children: [
          { path: '', pathMatch: 'full', loadComponent: () => import('./features/call-center/dashboard/call-center-dashboard').then(m => m.CallCenterDashboard) },
          { path: 'history', loadComponent: () => import('./features/call-center/call-history/call-history').then(m => m.CallHistory) },
          { path: 'missed', canActivate: [branchHeadGuard], loadComponent: () => import('./features/call-center/missed-calls/missed-calls').then(m => m.MissedCalls) },
          { path: 'telecallers', canActivate: [branchHeadGuard], loadComponent: () => import('./features/call-center/telecaller-status/telecaller-status').then(m => m.TelecallerStatus) },
        ],
      },
      { path: 'lead-management', loadComponent: () => import('./pages/lead-management/lead-management').then(m => m.LeadManagement) },
      { path: 'follow-ups', loadComponent: () => import('./pages/followups/followups').then(m => m.Followups) },
      { path: 'masters/service-category', loadComponent: () => import('./pages/look-up-master/service-category/service-category').then(m => m.ServiceCategory) },
      { path: 'masters/source', loadComponent: () => import('./pages/look-up-master/source/source').then(m => m.Source) },
      { path: 'masters/lead-status', loadComponent: () => import('./pages/look-up-master/lead-status/lead-status').then(m => m.LeadStatus) },
      { path: 'masters/organization', loadComponent: () => import('./pages/look-up-master/organization/organization').then(m => m.Organization) },
      { path: 'masters/users', loadComponent: () => import('./pages/look-up-master/users/users').then(m => m.Users) },
      { path: 'masters/roles', loadComponent: () => import('./pages/look-up-master/roles/roles').then(m => m.Roles) },
      { path: 'masters/roles-and-permission', loadComponent: () => import('./pages/look-up-master/roles-permission/roles-permission').then(m => m.RolesPermission) },
      { path: 'masters/roles-and-permission/add', loadComponent: () => import('./pages/look-up-master/roles-permission/add-roles-permission-form/add-roles-permission-form').then(m => m.AddRolesPermissionForm) },
      { path: 'masters/roles-and-permission/edit/:id', loadComponent: () => import('./pages/look-up-master/roles-permission/add-roles-permission-form/add-roles-permission-form').then(m => m.AddRolesPermissionForm) },
      { path: 'masters/roles-and-permission/assign', loadComponent: () => import('./pages/look-up-master/roles-permission/role-permission-matrix/role-permission-matrix').then(m => m.RolePermissionMatrix) },
      { path: 'masters/user', loadComponent: () => import('./pages/look-up-master/users/users').then(m => m.Users) },
      { path: 'appointments', loadComponent: () => import('./pages/appointment-page/appointment-page').then(m => m.AppointmentPage) },
      { path: 'customers', loadComponent: () => import('./pages/customer-portal-page/customer-portal-page').then(m => m.CustomerPortalPage) },
      { path: 'treatments', loadComponent: () => import('./pages/treatment-management/treatment-management').then(m => m.TreatmentManagement) },
      { path: 'treatments/create', loadComponent: () => import('./pages/treatment-management/treatment-create').then(m => m.TreatmentCreate) },
      { path: 'inventory', pathMatch: 'full', redirectTo: 'inventory/products' },
      { path: 'inventory/products', loadComponent: () => import('./pages/inventory/product-management/product-management').then(m => m.ProductManagement) },
      { path: 'inventory/vendors', loadComponent: () => import('./pages/inventory/vendor-management/vendor-management').then(m => m.VendorManagement) },
      { path: 'inventory/purchase', pathMatch: 'full', redirectTo: 'inventory/purchase-requests' },
      { path: 'inventory/purchase-requests', loadComponent: () => import('./pages/inventory/purchase/purchase-requests/purchase-requests').then(m => m.PurchaseRequests) },
      { path: 'inventory/purchase-orders', loadComponent: () => import('./pages/inventory/purchase/purchase-orders/purchase-orders').then(m => m.PurchaseOrders) },
      { path: 'inventory/purchase-inward', loadComponent: () => import('./pages/inventory/purchase/goods-inward/goods-inward').then(m => m.GoodsInward) },
      { path: 'inventory/goods-inward', pathMatch: 'full', redirectTo: 'inventory/purchase-inward' },
      { path: 'inventory/purchase-returns', loadComponent: () => import('./pages/inventory/purchase/purchase-returns/purchase-returns').then(m => m.PurchaseReturns) },
      { path: 'inventory/vendor-notes', loadComponent: () => import('./pages/inventory/purchase/vendor-notes/vendor-notes').then(m => m.VendorNotes) },
      { path: 'inventory/stock', loadComponent: () => import('./pages/inventory/purchase/stock/stock-overview').then(m => m.StockOverview) },
      // HR Management
      { path: 'hr-management', pathMatch: 'full', redirectTo: 'hr/employees' },
      { path: 'hr', pathMatch: 'full', redirectTo: 'hr/employees' },
      { path: 'hr/employees', loadComponent: () => import('./pages/hr-management/employees/employees').then(m => m.Employees) },
      { path: 'hr/attendance', loadComponent: () => import('./pages/hr-management/attendance/attendance').then(m => m.Attendance) },
      { path: 'hr/leave-permission', loadComponent: () => import('./pages/hr-management/leave-permission/leave-permission').then(m => m.LeavePermission) },
      { path: 'hr/recruitment', loadComponent: () => import('./pages/hr-management/recruitment/recruitment').then(m => m.Recruitment) },
      { path: 'hr/payroll', loadComponent: () => import('./pages/hr-management/payroll/payroll').then(m => m.Payroll) },
      { path: 'hr/appraisals', loadComponent: () => import('./pages/hr-management/appraisals/appraisals').then(m => m.Appraisals) },
      { path: 'hr/tasks', loadComponent: () => import('./pages/hr-management/tasks/tasks').then(m => m.Tasks) },
      { path: 'hr/onboarding-exit', loadComponent: () => import('./pages/hr-management/onboarding-exit/onboarding-exit').then(m => m.OnboardingExit) },
      // Branch Management
      { path: 'branches', loadComponent: () => import('./pages/branch-management/branches/branches').then(m => m.Branches) },
      { path: 'branches/:id', loadComponent: () => import('./pages/branch-management/branch-details/branch-details').then(m => m.BranchDetails) },
      { path: 'branches/:id/employees', loadComponent: () => import('./pages/branch-management/branch-employees/branch-employees').then(m => m.BranchEmployees) },
      // Franchise Management
      { path: 'franchises', loadComponent: () => import('./pages/franchise-management/franchises/franchises').then(m => m.Franchises) },
      { path: 'franchises/:id', loadComponent: () => import('./pages/franchise-management/franchise-details/franchise-details').then(m => m.FranchiseDetails) },
      // Accounts
      { path: 'accounts', pathMatch: 'full', redirectTo: 'accounts/day-book' },
      { path: 'accounts/day-book', loadComponent: () => import('./pages/accounts/day-book/day-book').then(m => m.DayBook) },
      { path: 'accounts/bills', loadComponent: () => import('./pages/accounts/bills/bills').then(m => m.Bills) },
      { path: 'accounts/vouchers', loadComponent: () => import('./pages/accounts/vouchers/vouchers').then(m => m.Vouchers) },
      { path: 'accounts/ledgers', loadComponent: () => import('./pages/accounts/ledgers/ledgers').then(m => m.Ledgers) },
      { path: 'accounts/targets', loadComponent: () => import('./pages/accounts/targets/targets').then(m => m.Targets) },
      { path: 'reports', loadComponent: () => import('./pages/reports/reports').then(m => m.Reports) },
      { path: 'reports/:id', loadComponent: () => import('./pages/reports/report-detail/report-detail').then(m => m.ReportDetail) },
      { path: 'settings', loadComponent: () => import('./pages/settings-page/settings-page').then(m => m.SettingsPage) },

    ],
  },
  {
    // Branch QR codes point here (?code=<encrypted branch code>) - logs the scan, then
    // redirects on to the configured lead form.
    path: 'scan',
    loadComponent: () => import('./public/qr-landing-page/qr-landing-page').then(m => m.QrLandingPage),
  },
  {
    // Current QR codes carry data via ?d=... on this path; :id is kept for older/manual links.
    path: 'branch-info',
    loadComponent: () => import('./public/branch-info-page/branch-info-page').then(m => m.BranchInfoPage),
  },
  {
    path: 'branch-info/:id',
    loadComponent: () => import('./public/branch-info-page/branch-info-page').then(m => m.BranchInfoPage),
  },
  { path: '404', loadComponent: () => import('./not-found-page/not-found-page').then(m => m.NotFoundPage) },
  { path: '**', loadComponent: () => import('./not-found-page/not-found-page').then(m => m.NotFoundPage) },
];
