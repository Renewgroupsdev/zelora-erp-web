export interface AuthUserRole {
  id: number;
  name: string;
  slug: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role?: AuthUserRole | null;
  org_unit_id: number | null;
  phone_no: string | null;
  status: string;
  profile_photo: string | null;
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

export type LoginResponse = ApiResponse<LoginResponseData>;

export const ROLE_LABELS: Record<number, string> = {
  1: 'Administrator',
};

export function roleLabel(roleId: number | null | undefined): string {
  if (roleId == null) return 'Staff';
  return ROLE_LABELS[roleId] ?? 'Staff';
}

/** Only the Administrator role sees every record; every other role (telecaller included) is
 *  scoped to records it owns. Roles beyond Administrator are managed dynamically via the
 *  Roles & Permissions module, so this stays a simple "is role 1" check rather than a fixed list. */
export function isAdmin(roleId: number | null | undefined): boolean {
  return roleId === 1;
}

/** Role slugs that should see the branch-head view of the call center (branch alerts,
 *  telecaller roster) rather than the plain telecaller view. Mirrors the backend's
 *  config('telephony.roles.branch_head') plus the roles that can see everything. */
const CALL_CENTER_SUPERVISOR_SLUGS = ['branch_manager', 'branch_head', 'super_admin', 'admin', 'franchise_owner'];

/** True when the user's role slug marks them as a plain telecaller (not a branch head/
 *  supervisor/admin) - used to hide branch-wide call center views they shouldn't see. */
export function isTelecallerRole(user: Pick<AuthUser, 'role_id' | 'role'> | null | undefined): boolean {
  if (!user) return false;
  if (isAdmin(user.role_id)) return false;
  const slug = user.role?.slug;
  if (!slug) return true; // no role info yet - default to the more restrictive view
  return !CALL_CENTER_SUPERVISOR_SLUGS.includes(slug);
}
