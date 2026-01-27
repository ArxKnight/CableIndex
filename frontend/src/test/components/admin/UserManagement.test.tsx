import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserManagement from '../../../components/admin/UserManagement';
import { apiClient } from '../../../lib/api';

// Mock the API client
vi.mock('../../../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
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
vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '2 days ago'),
}));

const mockUsers = [
  {
    id: 1,
    email: 'admin@example.com',
    full_name: 'Admin User',
    role: 'admin',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    label_count: 10,
    site_count: 3,
    last_activity: '2024-01-15T00:00:00Z',
  },
  {
    id: 2,
    email: 'user@example.com',
    full_name: 'Regular User',
    role: 'user',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    label_count: 5,
    site_count: 1,
    last_activity: '2024-01-14T00:00:00Z',
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
    expect(screen.getByText('Actions')).toBeInTheDocument();
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
      expect(apiClient.get).toHaveBeenCalledWith('/admin/users?search=admin&');
    });
  });

  it('filters users by role', async () => {
    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    // Find and click the role filter dropdown
    const roleFilter = screen.getByRole('combobox');
    fireEvent.click(roleFilter);

    // Select admin role
    const adminOption = screen.getByText('Admin');
    fireEvent.click(adminOption);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/admin/users?role=admin');
    });
  });

  it('handles role change', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({
      success: true,
      message: 'Role updated successfully',
    });

    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Regular User')).toBeInTheDocument();
    });

    // Find and click the actions dropdown for the regular user
    const actionButtons = screen.getAllByRole('button');
    const actionsButton = actionButtons.find(button => 
      button.querySelector('svg')?.classList.contains('lucide-more-horizontal')
    );
    
    if (actionsButton) {
      fireEvent.click(actionsButton);

      // Click "Make Admin" option
      const makeAdminOption = screen.getByText('Make Admin');
      fireEvent.click(makeAdminOption);

      await waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith('/admin/users/2/role', { role: 'admin' });
      });
    }
  });

  it('handles user deletion', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({
      success: true,
      message: 'User deleted successfully',
    });

    const Wrapper = createWrapper();
    render(<UserManagement />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Regular User')).toBeInTheDocument();
    });

    // Find and click the actions dropdown for the regular user
    const actionButtons = screen.getAllByRole('button');
    const actionsButton = actionButtons.find(button => 
      button.querySelector('svg')?.classList.contains('lucide-more-horizontal')
    );
    
    if (actionsButton) {
      fireEvent.click(actionsButton);

      // Click "Delete User" option
      const deleteOption = screen.getByText('Delete User');
      fireEvent.click(deleteOption);

      // Confirm deletion in dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalledWith('/admin/users/2');
      });
    }
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