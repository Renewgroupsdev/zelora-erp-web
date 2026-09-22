export class ApiRoutesConstants {
//user_login
  public static AUTH_REGISTER = "";
  public static AUTH_LOGIN = "";
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

}