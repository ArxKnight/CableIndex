import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AuthUser, AuthTokens, LoginCredentials, RegisterData, AuthState, SiteMembership } from '../types';
import { apiClient, setAuthTokens, getAuthTokens, clearAuthTokens } from '../lib/api';
import { toast } from 'sonner';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updatedUser: AuthUser) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [memberships, setMemberships] = useState<SiteMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user && !!tokens;

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedTokens = getAuthTokens();
        if (storedTokens) {
          setTokens(storedTokens);
          
          // Verify token and get user data
          const response = await apiClient.getCurrentUser();
          if (response.success && response.data?.user) {
            setUser(response.data.user);
            setMemberships(response.data.memberships ?? []);
          } else {
            // Invalid token, clear storage
            clearAuthTokens();
            setTokens(null);
            setMemberships([]);
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        clearAuthTokens();
        setTokens(null);
        setMemberships([]);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      const response = await apiClient.login(credentials.email, credentials.password);
      
      if (response.success && response.data) {
        const { user: userData, accessToken, refreshToken, expiresIn } = response.data;
        const authTokens: AuthTokens = { accessToken, refreshToken, expiresIn };
        
        setUser(userData);
        setTokens(authTokens);
        setAuthTokens(authTokens);

        // Load memberships (and normalized role) from /me
        const me = await apiClient.getCurrentUser();
        if (me.success && me.data?.memberships) {
          if (me.data.user) setUser(me.data.user);
          setMemberships(me.data.memberships);
        }
        toast.success(`Welcome back, ${userData.username}!`);
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData) => {
    try {
      setIsLoading(true);
      const response = await apiClient.register(data.email, data.username, data.password);
      
      if (response.success && response.data) {
        const { user: userData, accessToken, refreshToken, expiresIn } = response.data;
        const authTokens: AuthTokens = { accessToken, refreshToken, expiresIn };
        
        setUser(userData);
        setTokens(authTokens);
        setAuthTokens(authTokens);

        // Load memberships (and normalized role) from /me
        const me = await apiClient.getCurrentUser();
        if (me.success && me.data?.memberships) {
          if (me.data.user) setUser(me.data.user);
          setMemberships(me.data.memberships);
        }
        toast.success(`Welcome to CableIndex, ${userData.username}!`);
      } else {
        throw new Error(response.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Call logout endpoint (optional, for server-side cleanup)
      if (tokens) {
        await apiClient.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of API call result
      setUser(null);
      setTokens(null);
      setMemberships([]);
      clearAuthTokens();
    }
  };

  const refreshUser = async () => {
    try {
      if (!tokens) return;
      
      const response = await apiClient.getCurrentUser();
      if (response.success && response.data?.user) {
        setUser(response.data.user);
        setMemberships(response.data.memberships ?? []);
      }
    } catch (error) {
      console.error('Refresh user error:', error);
      // If refresh fails, logout user
      await logout();
    }
  };

  const updateUser = (updatedUser: AuthUser) => {
    setUser(updatedUser);
  };

  const value: AuthContextType = {
    user,
    memberships,
    tokens,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};