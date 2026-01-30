// Common types for the application
export interface User {
  id: number;
  email: string;
  full_name: string;
  password_hash: string;
  role: UserRole;
  is_active?: boolean | number;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: number;
  name: string;
  code: string;
  created_by: number;
  location?: string;
  description?: string;
  is_active?: boolean | number;
  created_at: string;
  updated_at: string;
}

export interface Label {
  id: number;
  site_id: number;
  created_by: number;
  ref_number: number;
  ref_string: string;
  type: string;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
  // Legacy API compatibility fields
  reference_number?: string;
  source?: string;
  destination?: string;
  notes?: string;
  zpl_content?: string;
}

export interface SiteMembership {
  id: number;
  site_id: number;
  user_id: number;
  site_role: SiteRole;
}

export type UserRole = 'GLOBAL_ADMIN' | 'ADMIN' | 'USER';
export type SiteRole = 'ADMIN' | 'USER';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}