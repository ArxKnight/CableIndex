import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  Toaster: () => null,
}));

const setAuthRole = (role: 'GLOBAL_ADMIN' | 'ADMIN' | 'USER') => {
  const current = (globalThis as any).__TEST_AUTH__;
  (globalThis as any).__TEST_AUTH__ = {
    ...current,
    user: {
      ...(current?.user ?? {}),
      id: role === 'USER' ? 2 : 1,
      email: role === 'USER' ? 'user@example.com' : 'admin@example.com',
      full_name: role === 'USER' ? 'Regular User' : 'Admin User',
      role,
    },
    isAuthenticated: true,
    isLoading: false,
  };
};

const renderApp = () => render(<App />);

describe('Admin Workflow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Ensure each test starts from a known route; previous tests may leave the app on /admin.
    window.history.pushState({}, '', '/dashboard');
  });

  it('should allow admin to access admin panel', async () => {
    const { apiClient } = await import('../../lib/api');
    setAuthRole('ADMIN');

    // Dashboard dependencies
    vi.mocked(apiClient.getSites).mockResolvedValue({ success: true, data: { sites: [] } } as any);
    vi.mocked(apiClient.getLabelStats).mockResolvedValue({ success: true, data: { stats: {} } } as any);
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({ success: true, data: { labels: [] } } as any);

    // Admin page dependencies
    vi.mocked(apiClient.get).mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/admin/users')) {
        return { success: true, data: { users: [] } } as any;
      }
      if (endpoint === '/admin/invitations') {
        return { success: true, data: { invitations: [] } } as any;
      }
      if (endpoint === '/admin/settings') {
        return {
          success: true,
          data: {
            settings: {
              default_user_role: 'user',
              maintenance_mode: false,
            },
          },
        } as any;
      }

      return { success: true, data: {} } as any;
    });

    renderApp();

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    });

    // Navigate to admin panel
    const adminLinks = screen.getAllByRole('link', { name: /admin/i });
    await userEvent.click(adminLinks[0]);

    // Wait for admin page
    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });

    // Verify admin sections are visible
    expect(screen.getByText('User Management')).toBeInTheDocument();

    // Application Settings lives under the Settings tab
    await userEvent.click(screen.getByRole('tab', { name: /settings/i }));
    expect(screen.getByText('Application Settings')).toBeInTheDocument();
  });

  it('should allow admin to invite new users', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    setAuthRole('ADMIN');

    const sites = [{ id: 1, name: 'Site A', code: 'A' }];

    // Dashboard dependencies
    vi.mocked(apiClient.getSites).mockResolvedValue({ success: true, data: { sites } } as any);
    vi.mocked(apiClient.getLabelStats).mockResolvedValue({
      success: true,
      data: { stats: { total_labels: 0, labels_this_month: 0, labels_today: 0 } },
    } as any);
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({ success: true, data: { labels: [] } } as any);

    // Admin page dependencies
    vi.mocked(apiClient.get).mockImplementation(async (endpoint: string) => {
      if (endpoint.startsWith('/admin/users')) {
        return { success: true, data: { users: [] } } as any;
      }
      if (endpoint === '/admin/invitations') {
        return { success: true, data: { invitations: [] } } as any;
      }
      if (endpoint === '/admin/settings') {
        return {
          success: true,
          data: {
            settings: {
              default_user_role: 'user',
              maintenance_mode: false,
            },
          },
        } as any;
      }
      return { success: true, data: {} } as any;
    });

    vi.mocked(apiClient.inviteUser).mockResolvedValue({
      success: true,
      data: {
        token: 'mock-invitation-token',
        invite_url: 'http://localhost/auth/register?token=mock-invitation-token',
        email_sent: false,
        email_error: 'SMTP not configured',
      },
    } as any);

    renderApp();

    // Navigate to admin panel
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    });

    const adminLinks = screen.getAllByRole('link', { name: /admin/i });
    await user.click(adminLinks[0]);

    // Wait for admin page
    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });

    // Switch to Invitations tab
    await user.click(screen.getByRole('tab', { name: /invitations/i }));

    // Click invite user button
    const inviteButton = await screen.findByRole('button', { name: /invite user/i });
    await user.click(inviteButton);

    // Fill in invitation form
    const nameInput = screen.getByLabelText(/full name/i);
    await user.type(nameInput, 'New User');

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'newuser@example.com');

    // Select at least one site (defaults to USER role)
    await user.click(screen.getByRole('checkbox', { name: /site a/i }));

    // Submit invitation
    const sendButton = screen.getByRole('button', { name: /send invitation/i });
    await user.click(sendButton);

    // Verify API was called
    await waitFor(() => {
      expect(apiClient.inviteUser).toHaveBeenCalledWith(
        'newuser@example.com',
        [{ site_id: 1, site_role: 'USER' }],
        'New User'
      );
    });
  });

  it('should allow admin to update application settings', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    setAuthRole('ADMIN');

    // Dashboard dependencies
    vi.mocked(apiClient.getSites).mockResolvedValue({ success: true, data: { sites: [] } } as any);
    vi.mocked(apiClient.getLabelStats).mockResolvedValue({ success: true, data: { stats: {} } } as any);
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({ success: true, data: { labels: [] } } as any);

    // Settings data
    vi.mocked(apiClient.get).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/admin/settings') {
        return {
          success: true,
          data: {
            settings: {
              default_user_role: 'user',
              maintenance_mode: false,
            },
          },
        } as any;
      }
      if (endpoint.startsWith('/admin/users')) {
        return { success: true, data: { users: [] } } as any;
      }
      if (endpoint === '/admin/invitations') {
        return { success: true, data: { invitations: [] } } as any;
      }
      return { success: true, data: {} } as any;
    });

    vi.mocked(apiClient.put).mockResolvedValue({ success: true, data: {} } as any);

    renderApp();

    // Navigate to admin panel
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    });

    const adminLinks = screen.getAllByRole('link', { name: /admin/i });
    await user.click(adminLinks[0]);

    // Wait for admin page
    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });

    // Switch to Settings tab (App defaults to Users)
    await user.click(screen.getByRole('tab', { name: /settings/i }));

    // Wait for settings tab content
    await waitFor(() => {
      expect(screen.getByText('Application Settings')).toBeInTheDocument();
    });

    // Make a change so the Save button becomes enabled
    const maxLabelsInput = screen.getByLabelText(/max labels per user/i);
    await user.clear(maxLabelsInput);
    await user.type(maxLabelsInput, '10');

    // Save settings
    const saveButton = screen.getByRole('button', { name: /save settings/i });
    await user.click(saveButton);

    // Verify API was called
    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        '/admin/settings',
        expect.objectContaining({
          default_user_role: 'user',
          maintenance_mode: false,
          max_labels_per_user: 10,
        })
      );
    });
  });

  it('should prevent non-admin users from accessing admin panel', async () => {
    const { apiClient } = await import('../../lib/api');
    setAuthRole('USER');

    // Dashboard dependencies
    vi.mocked(apiClient.getSites).mockResolvedValue({ success: true, data: { sites: [] } } as any);
    vi.mocked(apiClient.getLabelStats).mockResolvedValue({ success: true, data: { stats: {} } } as any);
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({ success: true, data: { labels: [] } } as any);

    renderApp();

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    });

    // Admin link should not be visible for regular users
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument();
  });
});