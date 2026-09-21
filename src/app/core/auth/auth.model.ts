export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role_id: number;
  org_unit_id: number | null;
  phone_no: string | null;
  status: string;
  profile_photo: string | null;
  [key: string]: unknown;
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
