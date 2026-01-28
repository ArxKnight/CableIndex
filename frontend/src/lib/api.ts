import { toast } from 'sonner';
import { ApiResponse, AuthTokens } from '../types';

// In production (Docker), frontend is served from same origin, so use relative path
// In development, use explicit localhost URL or VITE_API_URL override
const isProd = (import.meta as any).env?.MODE === 'production';
const envApiUrl = (import.meta as any).env?.VITE_API_URL;
const API_BASE_URL = isProd ? '/api' : (envApiUrl || 'http://localhost:3001/api');

// Log resolved API base URL for troubleshooting
console.info(`[API] Base URL: ${API_BASE_URL} (mode: ${(import.meta as any).env?.MODE || 'unknown'})`);

// Token management
let authTokens: AuthTokens | null = null;

export const setAuthTokens = (tokens: AuthTokens | null) => {
  authTokens = tokens;
  if (tokens) {
    localStorage.setItem('auth_tokens', JSON.stringify(tokens));
  } else {
    localStorage.removeItem('auth_tokens');
  }
};

export const getAuthTokens = (): AuthTokens | null => {
  if (authTokens) return authTokens;
  
  const stored = localStorage.getItem('auth_tokens');
  if (stored) {
    try {
      authTokens = JSON.parse(stored);
      return authTokens;
    } catch {
      localStorage.removeItem('auth_tokens');
    }
  }
  return null;
};

export const clearAuthTokens = () => {
  authTokens = null;
  localStorage.removeItem('auth_tokens');
};

// API client class
class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    const tokens = getAuthTokens();

    // Debug logging for API requests in development
    if ((import.meta as any).env?.MODE === 'development') {
      console.log(`[API] ${options.method || 'GET'} ${url}`);
    }

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // Add authorization header if tokens exist
    if (tokens?.accessToken) {
      (config.headers as Record<string, string>)['Authorization'] = 
        `Bearer ${tokens.accessToken}`;
    }

    try {
      const response = await fetch(url, config);
      
      // Handle network errors
      if (!response.ok && response.status >= 500) {
        const errorMessage = `Server error (${response.status}). Please try again later.`;
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Handle token refresh for 401 errors
      if (response.status === 401 && tokens?.refreshToken && endpoint !== '/auth/refresh') {
        try {
          const refreshResponse = await this.refreshToken(tokens.refreshToken);
          if (refreshResponse.success && refreshResponse.data) {
            setAuthTokens(refreshResponse.data);
            
            // Retry original request with new token
            (config.headers as Record<string, string>)['Authorization'] = 
              `Bearer ${refreshResponse.data.accessToken}`;
            
            const retryResponse = await fetch(url, config);
            const retryData = await retryResponse.json();
            
            if (!retryResponse.ok) {
              throw new Error(retryData.error || `HTTP error! status: ${retryResponse.status}`);
            }
            
            return retryData;
          }
        } catch (refreshError) {
          // Refresh failed, clear tokens
          clearAuthTokens();
          const errorMessage = 'Session expired. Please login again.';
          toast.error(errorMessage);
          throw new Error(errorMessage);
        }
      }

      if (!response.ok) {
        const errorMessage = data.error || `HTTP error! status: ${response.status}`;
        
        // Don't show toast for auth errors (handled by forms)
        if (response.status !== 401 && response.status !== 403) {
          toast.error(errorMessage);
        }
        
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      // Log detailed error info for debugging
      console.error(`[API Error] ${options.method || 'GET'} ${url}:`, error);
      
      // Handle network connectivity issues
      if (error instanceof TypeError) {
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
          const networkError = 'Network error. Please check your connection and try again.';
          toast.error(networkError);
          throw new Error(networkError);
        }
      }
      
      if (error instanceof Error) {
        throw error;
      }
      
      const unknownError = 'An unexpected error occurred';
      toast.error(unknownError);
      throw new Error(unknownError);
    }
  }

  // Auth endpoints
  async login(email: string, password: string) {
    console.log(`[Auth] Attempting login for: ${email}`);
    try {
      const response = await this.request<{ user: any } & AuthTokens>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      console.log(`[Auth] Login successful for: ${email}`);
      return response;
    } catch (error) {
      console.error(`[Auth] Login failed for ${email}:`, error);
      throw error;
    }
  }

  async register(email: string, full_name: string, password: string) {
    console.log(`[Auth] Attempting registration for: ${email}`);
    try {
      const response = await this.request<{ user: any } & AuthTokens>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, full_name, password }),
      });
      console.log(`[Auth] Registration successful for: ${email}`);
      return response;
    } catch (error) {
      console.error(`[Auth] Registration failed for ${email}:`, error);
      throw error;
    }
  }

  async refreshToken(refreshToken: string) {
    return this.request<AuthTokens>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  async getCurrentUser() {
    return this.request<{ user: any }>('/auth/me');
  }

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  async updateProfile(data: { email?: string; full_name?: string }) {
    return this.request<{ user: any }>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async changePassword(data: { current_password: string; new_password: string }) {
    return this.request('/auth/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Site endpoints
  async getSites(params?: { search?: string; limit?: number; offset?: number; include_counts?: boolean }) {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.append('search', params.search);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    if (params?.include_counts) searchParams.append('include_counts', params.include_counts.toString());
    
    const query = searchParams.toString();
    return this.request<{ sites: any[]; pagination: any }>(`/sites${query ? `?${query}` : ''}`);
  }

  async getSite(id: number) {
    return this.request<{ site: any }>(`/sites/${id}`);
  }

  async createSite(data: { name: string; code?: string; location?: string; description?: string }) {
    return this.request<{ site: any }>('/sites', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSite(id: number, data: { name?: string; code?: string; location?: string; description?: string }) {
    return this.request<{ site: any }>(`/sites/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSite(id: number) {
    return this.request(`/sites/${id}`, { method: 'DELETE' });
  }

  // Label endpoints
  async getLabels(params: {
    site_id: number;
    search?: string;
    source?: string;
    destination?: string;
    reference_number?: string;
    limit?: number;
    offset?: number;
    sort_by?: 'created_at' | 'ref_string';
    sort_order?: 'ASC' | 'DESC';
  }) {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.append('search', params.search);
    if (params?.site_id) searchParams.append('site_id', params.site_id.toString());
    if (params?.source) searchParams.append('source', params.source);
    if (params?.destination) searchParams.append('destination', params.destination);
    if (params?.reference_number) searchParams.append('reference_number', params.reference_number);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    if (params?.sort_by) searchParams.append('sort_by', params.sort_by);
    if (params?.sort_order) searchParams.append('sort_order', params.sort_order);
    
    const query = searchParams.toString();
    return this.request<{ labels: any[]; pagination: any }>(`/labels${query ? `?${query}` : ''}`);
  }

  async getLabel(id: number, siteId: number) {
    return this.request<{ label: any }>(`/labels/${id}?site_id=${siteId}`);
  }

  async createLabel(data: { source: string; destination: string; site_id: number; notes?: string; zpl_content?: string }) {
    return this.request<{ label: any }>('/labels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLabel(id: number, data: { site_id: number; source?: string; destination?: string; notes?: string; zpl_content?: string }) {
    return this.request<{ label: any }>(`/labels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteLabel(id: number, siteId: number) {
    return this.request(`/labels/${id}?site_id=${siteId}`, { method: 'DELETE' });
  }

  async bulkDeleteLabels(siteId: number, ids: number[]) {
    return this.request<{ deleted_count: number }>('/labels/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, ids }),
    });
  }

  async getLabelStats(siteId: number) {
    return this.request<{ stats: any }>(`/labels/stats?site_id=${siteId}`);
  }

  async getRecentLabels(siteId: number, limit?: number) {
    const searchParams = new URLSearchParams();
    searchParams.append('site_id', siteId.toString());
    if (limit) searchParams.append('limit', limit.toString());
    
    const query = searchParams.toString();
    return this.request<{ labels: any[] }>(`/labels/recent${query ? `?${query}` : ''}`);
  }

  // Admin endpoints
  async getUsers(params?: { search?: string; role?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.append('search', params.search);
    if (params?.role) searchParams.append('role', params.role);
    
    const query = searchParams.toString();
    return this.request<{ users: any[] }>(`/admin/users${query ? `?${query}` : ''}`);
  }

  async updateUserRole(userId: number, role: string) {
    return this.request(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async deleteUser(userId: number) {
    return this.request(`/admin/users/${userId}`, { method: 'DELETE' });
  }

  async inviteUser(email: string, sites: Array<{ site_id: number; site_role: 'ADMIN' | 'USER' }>, full_name: string) {
    return this.request('/admin/invite', {
      method: 'POST',
      body: JSON.stringify({ email, full_name, sites }),
    });
  }

  async getUserSites(userId: number) {
    return this.request<{ sites: any[] }>(`/admin/users/${userId}/sites`);
  }

  async updateUserSites(userId: number, sites: Array<{ site_id: number; site_role: 'ADMIN' | 'USER' }>) {
    return this.request(`/admin/users/${userId}/sites`, {
      method: 'PUT',
      body: JSON.stringify({ sites }),
    });
  }

  async getInvitations() {
    return this.request<{ invitations: any[] }>('/admin/invitations');
  }

  async cancelInvitation(invitationId: number) {
    return this.request(`/admin/invitations/${invitationId}`, { method: 'DELETE' });
  }

  async getAdminStats(siteId: number) {
    return this.request<any>(`/admin/stats?site_id=${siteId}`);
  }

  async validateInvite(token: string) {
    return this.request<any>(`/admin/validate-invite/${token}`);
  }

  async acceptInvite(data: { token: string; full_name: string; password: string }) {
    return this.request<any>('/admin/accept-invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAppSettings() {
    return this.request<{ settings: any }>('/admin/settings');
  }

  async updateAppSettings(settings: any) {
    return this.request('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // Generic methods for other endpoints
  async get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data: any) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Special method for downloading files as blobs
  async downloadFile(endpoint: string, data: any): Promise<Blob> {
    const url = `${this.baseURL}${endpoint}`;
    const tokens = getAuthTokens();

    const config: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };

    // Add authorization header if tokens exist
    if (tokens?.accessToken) {
      (config.headers as Record<string, string>)['Authorization'] = 
        `Bearer ${tokens.accessToken}`;
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error occurred');
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;