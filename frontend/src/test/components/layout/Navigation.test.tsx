import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

const renderNavigation = (initialPath = '/') => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Navigation />
    </MemoryRouter>
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
    
    expect(screen.getByText('CableIndex')).toBeInTheDocument();
  });

  it('should render navigation items for regular user', () => {
    renderNavigation();

    // Both desktop + mobile nav render in jsdom (no CSS), so use *AllBy* queries.
    expect(screen.getAllByRole('link', { name: /^sites$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /^tools$/i }).length).toBeGreaterThan(0);
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

    expect(screen.getAllByRole('link', { name: /^admin$/i }).length).toBeGreaterThan(0);
  });

  it('should hide items when user lacks permissions', () => {
    mockUsePermissions.mockReturnValue({
      canAccess: vi.fn((permission) => permission !== 'sites'),
      isAdmin: false,
    });

    renderNavigation();

    expect(screen.queryByRole('link', { name: /^sites$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^tools$/i }).length).toBeGreaterThan(0);
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
    renderNavigation('/sites');

    // Prefer the desktop nav link for the border-bottom active style.
    const sitesLinks = screen.getAllByRole('link', { name: /^sites$/i });
    const desktopSitesLink = sitesLinks.find((link) => link.className.includes('border-b-2'));
    expect(desktopSitesLink).toBeDefined();
    expect(desktopSitesLink!).toHaveClass('border-blue-500');
  });

  it('should render mobile navigation on small screens', () => {
    renderNavigation();
    
    // Mobile navigation should be present (check for mobile container)
    const mobileNavContainer = document.querySelector('.sm\\:hidden');
    expect(mobileNavContainer).toBeInTheDocument();
  });
});