import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import AdminPage from '../../pages/AdminPage';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock the admin components
vi.mock('../../components/admin/UserManagement', () => ({
  default: () => <div data-testid="user-management">User Management Component</div>
}));

vi.mock('../../components/admin/UserInvitations', () => ({
  default: () => <div data-testid="user-invitations">User Invitations Component</div>
}));

vi.mock('../../components/admin/AppSettings', () => ({
  default: () => <div data-testid="app-settings">App Settings Component</div>
}));

// Mock usePermissions hook
let mockIsAdmin = true;
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin: mockIsAdmin,
    canAccess: vi.fn(() => true),
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });





  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {children}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin = true;
  });

  it('renders admin panel with all tabs', async () => {
    const Wrapper = createWrapper();
    render(<AdminPage />, { wrapper: Wrapper });

    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    expect(screen.getByText('Manage users, permissions, and application settings')).toBeInTheDocument();

    // Check all tabs are present
    expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /invitations/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /settings/i })).toBeInTheDocument();
  });

  it('shows user management by default', async () => {
    const Wrapper = createWrapper();
    render(<AdminPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('user-management')).toBeInTheDocument();
    });
  });

  it('switches between tabs correctly', async () => {
    const Wrapper = createWrapper();
    render(<AdminPage />, { wrapper: Wrapper });

    const user = userEvent.setup();

    // Click on invitations tab
    const invitationsTab = screen.getByRole('tab', { name: /invitations/i });
    await user.click(invitationsTab);

    await waitFor(() => {
      expect(screen.getByTestId('user-invitations')).toBeInTheDocument();
    });

    // Click on settings tab
    const settingsTab = screen.getByRole('tab', { name: /settings/i });
    await user.click(settingsTab);

    await waitFor(() => {
      expect(screen.getByTestId('app-settings')).toBeInTheDocument();
    });

  });
});

describe('AdminPage - Non-Admin Access', () => {
  it('redirects non-admin users', () => {
    mockIsAdmin = false;

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });





    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            {children}
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );

    render(<AdminPage />, { wrapper: Wrapper });

    // Should redirect to dashboard (Navigate component)
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
  });
});