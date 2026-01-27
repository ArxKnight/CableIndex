import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../App';

// Mock the API client
vi.mock('../../lib/api', () => ({
  apiClient: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    getUsers: vi.fn(),
    updateUserRole: vi.fn(),
    deleteUser: vi.fn(),
    inviteUser: vi.fn(),
    getInvitations: vi.fn(),
    getAppSettings: vi.fn(),
    updateAppSettings: vi.fn(),
    getAdminStats: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock usePermissions hook
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasRole: (role: string) => role === 'admin',
    canAccess: () => true,
    canCreate: () => true,
    canEdit: () => true,
    canDelete: () => true,
    isAdmin: true,
  }),
}));

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const renderApp = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
};

describe('Admin Workflow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should allow admin to access admin panel', async () => {
    const { apiClient } = await import('../../lib/api');

    // Mock authenticated admin user
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 1,
          email: 'admin@example.com',
          full_name: 'Admin User',
          role: 'admin',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    // Mock admin data
    vi.mocked(apiClient.getUsers).mockResolvedValue({
      success: true,
      data: { users: [] },
    });

    vi.mocked(apiClient.getInvitations).mockResolvedValue({
      success: true,
      data: { invitations: [] },
    });

    vi.mocked(apiClient.getAppSettings).mockResolvedValue({
      success: true,
      data: {
        settings: {
          public_registration_enabled: false,
          default_user_role: 'user',
          maintenance_mode: false,
        },
      },
    });

    vi.mocked(apiClient.getAdminStats).mockResolvedValue({
      success: true,
      data: {
        total_users: 1,
        total_sites: 0,
        total_labels: 0,
        recent_registrations: 0,
      },
    });

    renderApp();

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Navigate to admin panel
    const adminLink = screen.getByRole('link', { name: /admin/i });
    await userEvent.click(adminLink);

    // Wait for admin page
    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });

    // Verify admin sections are visible
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Application Settings')).toBeInTheDocument();
  });

  it('should allow admin to invite new users', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    // Mock authenticated admin user
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 1,
          email: 'admin@example.com',
          full_name: 'Admin User',
          role: 'admin',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    // Mock admin data
    vi.mocked(apiClient.getUsers).mockResolvedValue({
      success: true,
      data: { users: [] },
    });

    vi.mocked(apiClient.getInvitations).mockResolvedValue({
      success: true,
      data: { invitations: [] },
    });

    vi.mocked(apiClient.inviteUser).mockResolvedValue({
      success: true,
      data: { token: 'mock-invitation-token' },
    });

    renderApp();

    // Navigate to admin panel
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    const adminLink = screen.getByRole('link', { name: /admin/i });
    await user.click(adminLink);

    // Wait for admin page
    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });

    // Click invite user button
    const inviteButton = screen.getByRole('button', { name: /invite user/i });
    await user.click(inviteButton);

    // Fill in invitation form
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'newuser@example.com');

    // Select role
    const roleSelect = screen.getByRole('combobox', { name: /role/i });
    await user.click(roleSelect);
    
    const userOption = screen.getByText('User');
    await user.click(userOption);

    // Submit invitation
    const sendButton = screen.getByRole('button', { name: /send invitation/i });
    await user.click(sendButton);

    // Verify API was called
    expect(apiClient.inviteUser).toHaveBeenCalledWith('newuser@example.com', 'user');
  });

  it('should allow admin to update application settings', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    // Mock authenticated admin user
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 1,
          email: 'admin@example.com',
          full_name: 'Admin User',
          role: 'admin',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    // Mock settings data
    vi.mocked(apiClient.getAppSettings).mockResolvedValue({
      success: true,
      data: {
        settings: {
          public_registration_enabled: false,
          default_user_role: 'user',
          maintenance_mode: false,
        },
      },
    });

    vi.mocked(apiClient.updateAppSettings).mockResolvedValue({
      success: true,
      data: {},
    });

    renderApp();

    // Navigate to admin panel
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    const adminLink = screen.getByRole('link', { name: /admin/i });
    await user.click(adminLink);

    // Wait for admin page and settings to load
    await waitFor(() => {
      expect(screen.getByText('Application Settings')).toBeInTheDocument();
    });

    // Toggle public registration
    const publicRegToggle = screen.getByRole('switch', { name: /public registration/i });
    await user.click(publicRegToggle);

    // Save settings
    const saveButton = screen.getByRole('button', { name: /save settings/i });
    await user.click(saveButton);

    // Verify API was called
    expect(apiClient.updateAppSettings).toHaveBeenCalledWith({
      public_registration_enabled: true,
      default_user_role: 'user',
      maintenance_mode: false,
    });
  });

  it('should prevent non-admin users from accessing admin panel', async () => {
    const { apiClient } = await import('../../lib/api');

    // Mock authenticated regular user
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 2,
          email: 'user@example.com',
          full_name: 'Regular User',
          role: 'user',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    // Mock usePermissions to return non-admin permissions
    vi.mocked(require('../../hooks/usePermissions').usePermissions).mockReturnValue({
      hasRole: (role: string) => role === 'user',
      canAccess: () => true,
      canCreate: () => true,
      canEdit: () => true,
      canDelete: () => false,
      isAdmin: false,
    });

    renderApp();

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Admin link should not be visible for regular users
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument();
  });
});