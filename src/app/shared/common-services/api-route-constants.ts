export class ApiRoutesConstants {
//user_login
  public static AUTH_REGISTER = "users";
  public static AUTH_LOGIN = "login";
  public static AUTH_REFRESH = "refresh-token";
  public static AUTH_LOGOUT = "logout";
  public static AUTH_FORGOT_PASSWORD = "forgot-password";
  public static AUTH_RESET_PASSWORD = "reset-password";
  public static AUTH_ME = "me";
  public static USER_ROLE_ACCESS = "";
  public static ROLE_GET_ACCESS = "";


//Lead Management (CURD)
   public static LEAD_GET_List = "customer-leads";
   public static LEAD_ADD = "customer-leads";
   public static LEAD_DELETE = "customer-leads";

   //Lookup Data
   public static Source_List_Options ='sources';
   public static Type_List_Options    ='service-category-requests';
   public static Status_List_Options    ='lead-statuses';

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
   public static USER_LIST = "users";

}