import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserManagement from '../../../components/admin/UserManagement';
import { apiClient } from '../../../lib/api';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 999,
      role: 'GLOBAL_ADMIN',
    },
  }),
}));

// Mock the API client
vi.mock('../../../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getSites: vi.fn(),
    getUserSites: vi.fn(),
    updateUserRole: vi.fn(),
    updateUserSites: vi.fn(),
  },
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock date-fns
vi.mock('date-fns/formatDistanceToNow', () => ({
  formatDistanceToNow: vi.fn(() => '2 days ago'),
}));

const mockUsers = [
  {
    id: 1,
    email: 'admin@example.com',
    username: 'Admin User',
    role: 'GLOBAL_ADMIN',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    label_count: 10,
    site_count: 3,
    last_activity: '2024-01-15T00:00:00Z',
    last_activity_at: '2024-01-15T00:00:00Z',
    last_activity_summary: 'Created label #0255 on site IVY',
  },
  {
    id: 2,
    email: 'user@example.com',
    username: 'Regular User',
    role: 'USER',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    label_count: 5,
    site_count: 1,
    last_activity: '2024-01-14T00:00:00Z',
    last_activity_at: '2024-01-14T00:00:00Z',
    last_activity_summary: 'Created location IVY on site IVY',
  },
];

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('UserManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({
      success: true,
      data: { users: mockUsers },
    });

    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: { sites: [] },
    } as any);

    vi.mocked(apiClient.getUserSites).mockResolvedValue({
      success: true,
      data: { sites: [] },
    } as any);
  });

  it('renders users table with data', async () => {
    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      expect(screen.getByText('Regular User')).toBeInTheDocument();
      expect(screen.getByText('user@example.com')).toBeInTheDocument();
    });

    // Check table headers
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('Sites')).toBeInTheDocument();
    expect(screen.getByText('Joined')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('shows activity summaries', async () => {
    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Created label #0255 on site IVY')).toBeInTheDocument();
      expect(screen.getByText('Created location IVY on site IVY')).toBeInTheDocument();
    });
  });

  it('displays user statistics correctly', async () => {
    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // Admin label count
      expect(screen.getByText('3')).toBeInTheDocument();  // Admin site count
      expect(screen.getByText('5')).toBeInTheDocument();  // User label count
      expect(screen.getByText('1')).toBeInTheDocument();  // User site count
    });
  });

  it('filters users by search term', async () => {
    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    const searchInput = screen.getByPlaceholderText('Search users by name or email...');
    fireEvent.change(searchInput, { target: { value: 'admin' } });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/admin/users?search=admin');
    });
  });

  it('filters users by role', async () => {
    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    // Find and click the role filter dropdown
    const roleFilter = screen.getByRole('combobox');
    fireEvent.click(roleFilter);

    // Select global admin role
    const adminOption = screen.getByText('Global Admin');
    fireEvent.click(adminOption);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/admin/users?role=GLOBAL_ADMIN');
    });
  });

  it('handles role change', async () => {
    vi.mocked(apiClient.updateUserRole).mockResolvedValue({
      success: true,
      message: 'Role updated successfully',
    });

    const user = userEvent.setup();

    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Regular User')).toBeInTheDocument();
    });

    const row = screen.getByText('Regular User').closest('tr');
    expect(row).toBeTruthy();
    await user.click(within(row as HTMLElement).getByRole('button', { name: /edit regular user/i }));

    await screen.findByText('User Details');

    const globalRoleLabel = screen.getByText('Global Role');
    const roleSelect = within(globalRoleLabel.parentElement as HTMLElement).getByRole('combobox');
    await user.click(roleSelect);
    await user.click(await screen.findByText('Global Admin'));

    await waitFor(() => {
      expect(apiClient.updateUserRole).toHaveBeenCalledWith(2, 'GLOBAL_ADMIN');
    });
  });

  it('handles user deletion', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({
      success: true,
      message: 'User deleted successfully',
    });

    const user = userEvent.setup();

    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Regular User')).toBeInTheDocument();
    });

    const row = screen.getByText('Regular User').closest('tr');
    expect(row).toBeTruthy();
    await user.click(within(row as HTMLElement).getByRole('button', { name: /edit regular user/i }));

    await screen.findByText('User Details');

    const deleteButton = await screen.findByRole('button', { name: /delete user/i });
    await user.click(deleteButton);

    // Confirm deletion in dialog
    const confirmDeleteButton = await screen.findByRole('button', { name: /delete \(user only\)/i });
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/admin/users/2');
    });
  });

  it('shows loading state', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {})); // Never resolves

    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    expect(screen.getByText('Loading users...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Failed to load users'));

    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load users/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no users found', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      success: true,
      data: { users: [] },
    });

    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No users found')).toBeInTheDocument();
    });
  });
});