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
  org_unit_id: number | null;
  phone_no: string | null;
  status: string;
  profile_photo: string | null;
  profile_photo_url?: string;
  [key: string]: unknown;
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
