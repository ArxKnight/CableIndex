// Common types for the application
export interface User {
  id: number;
  email: string;
  full_name: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Site {
  id: number;
  name: string;
  location: string;
  description?: string;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface Label {
  id: number;
  reference_number: string;
  source: string;
  destination: string;
  site_id: number;
  user_id: number;
  notes?: string;
  zpl_content?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'admin' | 'moderator' | 'user';

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