export class ApiRoutesConstants {
//user_login
  public static AUTH_REGISTER = "users";
  public static AUTH_LOGIN = "login";
  public static AUTH_REFRESH = "refresh-token";
  public static AUTH_LOGOUT = "logout";
  public static AUTH_FORGOT_PASSWORD = "forgot-password";
  public static AUTH_RESET_PASSWORD = "reset-password";
  public static AUTH_ME = "me";
  public static USER_ROLE_ACCESS = "side-bar";
  public static ROLE_GET_ACCESS = "";


//Lead Management (CURD)
   public static LEAD_GET_List = "customer-leads";
   public static LEAD_ADD = "customer-leads";
   public static LEAD_DELETE = "customer-leads";
   public static LEAD_EXPORT = "customer-leads/export";

   //Lookup Data
   public static Source_List_Options ='sources';
   public static Type_List_Options    ='service-category-requests';
   public static Status_List_Options    ='lead-statuses';
   public static Branch_List_Options    ='organization-units';

   //Service Category (CURD)
   public static SERVICE_CATEGORY_GET_List = "service-category-requests/2";
   public static SERVICE_CATEGORY_ADD = "service-category-requests";
   public static SERVICE_CATEGORY_DELETE = "service-category-requests";

   //Source (CURD)
   public static SOURCE_GET_List = "sources";
   public static SOURCE_ADD = "sources";
   public static SOURCE_DELETE = "sources";

   //Lead Status (CURD)
   public static LEAD_STATUS_GET_List = "lead-statuses";
   public static LEAD_STATUS_ADD = "lead-statuses";
   public static LEAD_STATUS_DELETE = "lead-statuses";

   //Roles (CURD)
   public static ROLES_GET_List = "roles";
   public static ROLES_ADD = "roles";
   public static ROLES_DELETE = "roles";

   //Roles & Permission (CURD)
   public static ROLES_PERMISSION_GET_List = "module-with-actions";
   public static ROLES_PERMISSION_ADD = "module-with-actions";
   public static ROLES_PERMISSION_DELETE = "module-with-actions";
   public static ROLES_PERMISSION_BULK_UPDATE = "module-with-actions/bulk-update";
   public static ROLES_PERMISSION_REORDER = "module-with-actions/reorder";
   public static ROLES_PERMISSION_SIDEBAR = 'side-bar';

   //Treatments (CURD)
   public static TREATMENT_GET_List = "treatments";
   public static TREATMENT_ADD = "treatments";
   public static TREATMENT_DELETE = "treatments";
   public static TREATMENT_CATEGORY_OPTIONS = "service-category-requests/1";
   public static TREATMENT_PRODUCT_OPTIONS = "products";

   //Inventory - Products & Vendors (CURD)
   public static PRODUCT_GET_List = "products";
   public static PRODUCT_ADD = "products";
   public static PRODUCT_DELETE = "products";
   public static VENDOR_GET_List = "vendors";
   public static VENDOR_ADD = "vendors";
   public static VENDOR_DELETE = "vendors";

   //Lead Appointment (CURD)
   public static LEAD_APPOINTMENT_ADD = "appointments";

   //Lead Follow-up (CURD)
   public static LEAD_FOLLOWUP_ADD = "follow-ups";

   //Reports
   public static REPORT_CUSTOMER_SOURCE = "reports/customer-source";
   public static REPORT_CUSTOMER_SOURCE_SUMMARY = "reports/customer-source/summary";
   public static REPORT_CUSTOMER_SOURCE_PERFORMANCE = "reports/customer-source/performance";
   public static REPORT_CUSTOMER_SOURCE_TREND = "reports/customer-source/trend";
   public static REPORT_CUSTOMER_SOURCE_COMPARISON = "reports/customer-source/comparison";
   public static REPORT_CUSTOMER_SOURCE_EXPORT = "reports/customer-source/export";

   public static REPORT_LEAD_CONVERSION_FUNNEL = "reports/lead-conversion/funnel";
   public static REPORT_LEAD_CONVERSION_SUMMARY = "reports/lead-conversion/summary";
   public static REPORT_LEAD_CONVERSION_TREND = "reports/lead-conversion/trend";
   public static REPORT_LEAD_CONVERSION_COMPARISON = "reports/lead-conversion/comparison";
   public static REPORT_LEAD_CONVERSION_EXPORT = "reports/lead-conversion/export";

   public static REPORT_LEAD_STATUS = "reports/lead-status";
   public static REPORT_LEAD_STATUS_SUMMARY = "reports/lead-status/summary";
   public static REPORT_LEAD_STATUS_PERFORMANCE = "reports/lead-status/performance";
   public static REPORT_LEAD_STATUS_TREND = "reports/lead-status/trend";
   public static REPORT_LEAD_STATUS_COMPARISON = "reports/lead-status/comparison";
   public static REPORT_LEAD_STATUS_EXPORT = "reports/lead-status/export";

   public static REPORT_FOLLOW_UP = "reports/follow-up";
   public static REPORT_FOLLOW_UP_SUMMARY = "reports/follow-up/summary";
   public static REPORT_FOLLOW_UP_PERFORMANCE = "reports/follow-up/performance";
   public static REPORT_FOLLOW_UP_TREND = "reports/follow-up/trend";
   public static REPORT_FOLLOW_UP_COMPARISON = "reports/follow-up/comparison";
   public static REPORT_FOLLOW_UP_EXPORT = "reports/follow-up/export";

   // CRM / Telephony
   public static CALL_LIST = "telephony/calls";
   public static CALL_OUTBOUND = "telephony/outbound";
   public static CALL_ALERT_LIST = "telephony/alerts";
   public static CALL_AGENT_LIST = "telephony/agents";
   public static CALL_AGENT_ME = "telephony/agents/me";
   public static CALL_AGENT_STATUS = "telephony/agents/status";
   public static CALL_DISPOSITIONS = "telephony/dispositions";
   public static CALL_REPORTS = "telephony/reports";
   public static LEAD_ASSIGN = "telephony/leads/assign";
   public static LEAD_WORK_STATS = "telephony/leads/stats";
   public static LEAD_FOLLOWUPS = "telephony/leads/followups";
   public static USER_LIST = "users";
   public static USER_ADD = "users";
   public static USER_DELETE = "users";

   //HR Management
   public static HR_EMPLOYEES = "hr/employees";

   //Settings (key-value)
   public static SETTINGS_GET = "settings";
   public static SETTINGS_UPDATE = "settings";

   //Organization Unit QR landing page (public, no auth)
   public static ORGANIZATION_UNIT_PUBLIC_SHOW = "public/organization-units";

   //Organization (CURD)
   public static ORGANIZATION_GET_List = "organization-units";
   public static ORGANIZATION_ADD = "organization-units";
   public static ORGANIZATION_DELETE = "organization-units";

   //QR scan tracking (public write, auth required for reporting)
   public static QR_SCAN_STORE = "qr-scans";
   public static QR_SCAN_CLICK = "qr-scans";
   public static QR_SCAN_LIST = "qr-scans";
   public static QR_SCAN_SUMMARY = "qr-scans/summary";

}