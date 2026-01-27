import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Navigation from '../../../components/layout/Navigation';

// Mock the auth context
const mockLogout = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock the permissions hook
const mockUsePermissions = vi.fn();

vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => mockUsePermissions(),
}));

const renderNavigation = () => {
  return render(
    <BrowserRouter>
      <Navigation />
    </BrowserRouter>
  );
};

describe('Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'user',
      },
      logout: mockLogout,
    });

    mockUsePermissions.mockReturnValue({
      canAccess: vi.fn().mockReturnValue(true),
      isAdmin: false,
    });
  });

  it('should render navigation with logo', () => {
    renderNavigation();
    
    expect(screen.getByText('Cable Manager')).toBeInTheDocument();
  });

  it('should render navigation items for regular user', () => {
    renderNavigation();
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Sites')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getByText('Port Labels')).toBeInTheDocument();
    expect(screen.getByText('PDU Labels')).toBeInTheDocument();
  });

  it('should not show admin items for regular user', () => {
    renderNavigation();
    
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });

  it('should show admin items for admin user', () => {
    mockUsePermissions.mockReturnValue({
      canAccess: vi.fn().mockReturnValue(true),
      isAdmin: true,
    });

    renderNavigation();
    
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument();
  });

  it('should hide items when user lacks permissions', () => {
    mockUsePermissions.mockReturnValue({
      canAccess: vi.fn((permission) => permission !== 'sites'),
      isAdmin: false,
    });

    renderNavigation();
    
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sites/i })).not.toBeInTheDocument();
  });

  it('should display user information in dropdown', async () => {
    const user = userEvent.setup();
    renderNavigation();
    
    const userButton = screen.getByRole('button');
    await user.click(userButton);
    
    await waitFor(() => {
      expect(screen.getAllByText('Test User')[0]).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('Role: user')).toBeInTheDocument();
    });
  });

  it('should handle logout when logout button is clicked', async () => {
    const user = userEvent.setup();
    renderNavigation();
    
    const userButton = screen.getByRole('button');
    await user.click(userButton);
    
    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Logout'));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('should show profile link in dropdown', async () => {
    const user = userEvent.setup();
    renderNavigation();
    
    const userButton = screen.getByRole('button');
    await user.click(userButton);
    
    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });
  });

  it('should highlight active navigation item', () => {
    renderNavigation();
    
    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toHaveClass('border-blue-500');
  });

  it('should render mobile navigation on small screens', () => {
    renderNavigation();
    
    // Mobile navigation should be present (check for mobile container)
    const mobileNavContainer = document.querySelector('.sm\\:hidden');
    expect(mobileNavContainer).toBeInTheDocument();
  });
});