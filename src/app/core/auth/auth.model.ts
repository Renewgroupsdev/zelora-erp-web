import { SidebarModule } from '../../shared/models/permission.model';

export type { SidebarModule };

export interface AuthUserRole {
  id: number;
  name: string;
  slug: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  /** Which table the profile came from: users, employees (hr_employees) or customers. */
  login_type?: 'user' | 'employee' | 'customer';
  role_id: number | null;
  role?: AuthUserRole | null;
  /** Role name sent by the login API (Branch Manager, Staff, ...); shown in the top bar. */
  role_name?: string | null;
  branch_or_franchise_id: number | null;
  /** Whether branch_or_franchise_id is a branch or a franchise (users.branch_or_franchise_type). */
  branch_or_franchise_type?: UnitType | null;
  /** Header branch / franchise filter: may this login switch, and the branch / franchise it belongs to. */
  scope?: AuthScope | null;
  /** Device of the last login: "web" | "mobile"; device_type (Android | iOS) is set by the mobile app only. */
  device_name?: string | null;
  device_type?: string | null;
  /** Checked in today and not checked out yet (false without an employee record). */
  is_checkedin?: boolean;
  /** hr_employees.is_wfh: 0 = work from home, 1 = work from office; null without an employee record. */
  is_wfh?: 0 | 1 | null;
  /** true when is_wfh = 1 (punches in / out at the branch / franchise). */
  /** Location of the account's branch / franchise (null when it has none). */
  branch_latitude?: number | null;
  branch_longitude?: number | null;
  /** The device location sent with this login (null on refresh / me, or when not sent) and the distance from the branch. */
  user_latitude?: number | null;
  user_longitude?: number | null;
  distance_from_branch_m?: number | null;
  phone_no: string | null;
  status: string;
  profile_photo: string | null;
  profile_photo_url?: string;
  [key: string]: unknown;
}

export type UnitType = 'branch' | 'franchise';

export interface AuthScope {
  /**
   * May use the header dropdown: the role has the "Header Branch / Franchise Filter" action, or the login belongs to
   * several branches / franchises (then the dropdown offers only those). Otherwise the API holds the login to `unit`.
   */
  can_switch: boolean;
  /** Sees every branch / franchise (the "Header Branch / Franchise Filter" action). */
  all_access?: boolean;
  /** The login's main branch / franchise (null = none assigned). */
  unit: { id: number; name: string; code: string; type: UnitType | string } | null;
}

export interface ResetPasswordPayload {
  data: string;
  password: string;
  password_confirmation: string;
}

export interface LoginResponseData {
  user: AuthUser;
  token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export type LoginResponse = ApiResponse<LoginResponseData> & { Menus?: SidebarModule[] };

export const ROLE_LABELS: Record<number, string> = {
  1: 'Administrator',
};

export function roleLabel(roleId: number | null | undefined): string {
  if (roleId == null) return 'Staff';
  return ROLE_LABELS[roleId] ?? 'Staff';
}

export function isAdmin(roleId: number | null | undefined): boolean {
  return roleId === 1;
}

const CALL_CENTER_SUPERVISOR_SLUGS = ['branch_manager', 'branch_head', 'super_admin', 'admin', 'franchise_owner'];

export function isTelecallerRole(user: Pick<AuthUser, 'role_id' | 'role' | 'login_type'> | null | undefined): boolean {
  if (!user) return false;
  // Customers are not staff; employee logins run as staff and follow their role like any user.
  if (user.login_type === 'customer') return false;
  if (isAdmin(user.role_id)) return false;
  const slug = user.role?.slug;
  if (!slug) return true; 
  return !CALL_CENTER_SUPERVISOR_SLUGS.includes(slug);
}

/** Branch managers / heads, admins and super admins can open any employee's attendance details. */
export function canViewTeamAttendance(user: Pick<AuthUser, 'role_id' | 'role'> | null | undefined): boolean {
  if (!user) return false;
  return isAdmin(user.role_id) || ['branch_manager', 'branch_head', 'admin', 'super_admin'].includes(user.role?.slug ?? '');
}
