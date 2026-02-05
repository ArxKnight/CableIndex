// Common types for the frontend application
export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: number;
  name: string;
  code: string;
  location?: string;
  description?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SiteLocation {
  id: number;
  site_id: number;
  floor?: string | null;
  suite?: string | null;
  row?: string | null;
  rack?: string | null;
  label?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CableType {
  id: number;
  site_id: number;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Label {
  id: number;
  site_id: number;
  created_by: number;
  created_by_name?: string;
  created_by_email?: string;
  ref_number: number;
  ref_string: string;
  cable_type_id?: number | null;
  cable_type?: CableType | null;
  type: string;
  payload_json?: string | null;
  reference_number?: string;
  source?: string;
  destination?: string;
  source_location_id?: number | null;
  destination_location_id?: number | null;
  source_location?: SiteLocation | null;
  destination_location?: SiteLocation | null;
  notes?: string;
  zpl_content?: string;
  created_at: string;
  updated_at: string;
}

export interface LabelWithSiteInfo extends Label {
  site_name: string;
  site_location?: string;
}

export interface CreateLabelData {
  source_location_id: number;
  destination_location_id: number;
  cable_type_id: number;
  site_id: number;
  quantity?: number;
  notes?: string;
  zpl_content?: string;
}

export interface UpdateLabelData {
  source_location_id?: number;
  destination_location_id?: number;
  cable_type_id?: number;
  notes?: string;
  zpl_content?: string;
}

export interface LabelSearchParams {
  search?: string;
  site_id: number;
  reference_number?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'ref_string';
  sort_order?: 'ASC' | 'DESC';
  include_site_info?: boolean;
}

export interface LabelStats {
  total_labels: number;
  labels_this_month: number;
  labels_today: number;
}

export type UserRole = 'GLOBAL_ADMIN' | 'ADMIN' | 'USER';
export type SiteRole = 'ADMIN' | 'USER';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: any;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  full_name: string;
  password: string;
}

export interface UpdateProfileData {
  email?: string;
  full_name?: string;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export interface AuthUser extends User {
  // Additional auth-specific properties can be added here
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  tokens: AuthTokens | null;
}