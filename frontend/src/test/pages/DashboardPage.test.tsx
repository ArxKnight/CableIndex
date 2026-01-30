import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '../../pages/DashboardPage';
import { apiClient } from '../../lib/api';

// Mock the API client
vi.mock('../../lib/api', () => ({
  apiClient: {
    getLabelStats: vi.fn(),
    getSites: vi.fn(),
    getRecentLabels: vi.fn(),
  },
}));

// Mock the auth context
let mockRole: 'GLOBAL_ADMIN' | 'ADMIN' | 'USER' = 'USER';
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      email: 'test@example.com',
      full_name: 'John Doe',
      role: mockRole,
    },
  }),
}));

// Mock the permissions hook
vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccess: vi.fn().mockReturnValue(true),
  }),
}));

const mockStats = {
  total_labels: 25,
  labels_this_month: 8,
  labels_today: 2,
};

const mockSites = [
  { id: 1, name: 'Site 1', code: 'SITE1' },
  { id: 2, name: 'Site 2', code: 'SITE2' },
  { id: 3, name: 'Site 3', code: 'SITE3' },
];

const mockSitesResponse = {
  sites: mockSites,
};

const renderDashboardPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = 'USER';
    
    // Mock successful API responses by default
    vi.mocked(apiClient.getLabelStats).mockResolvedValue({
      success: true,
      data: { stats: mockStats },
    } as any);
    
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: mockSitesResponse,
    } as any);
    
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({
      success: true,
      data: { labels: [] },
    } as any);
  });

  it('should render greeting with user name', async () => {
    renderDashboardPage();
    
    await waitFor(() => {
      expect(screen.getByText(/Good \w+, John!/)).toBeInTheDocument();
    });
  });

  it('should render dashboard description', () => {
    renderDashboardPage();
    
    expect(screen.getByText("Here's what's happening with your cable management today.")).toBeInTheDocument();
  });

  it('should render breadcrumb', () => {
    renderDashboardPage();
    
    // Breadcrumb should be present (home icon)
    const homeIcon = document.querySelector('svg');
    expect(homeIcon).toBeInTheDocument();
  });

  it('should display statistics cards with correct values', async () => {
    renderDashboardPage();
    
    await waitFor(() => {
      expect(screen.getByText('Total Labels')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
    });

    expect(screen.getByText('This Month')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    
    expect(screen.getByText('Active Sites')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should show loading state for statistics', () => {
    // Keep sites resolvable so a site is selected; block label stats so dashboard-stats query stays loading.
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: mockSitesResponse,
    } as any);
    vi.mocked(apiClient.getLabelStats).mockImplementation(() => new Promise(() => {}) as any);

    renderDashboardPage();

    // Wait until dashboard-stats query is in-flight
    return waitFor(() => {
      expect(screen.getAllByText('...').length).toBeGreaterThan(0);
    });
  });

  it('should render quick actions component', async () => {
    renderDashboardPage();
    
    await waitFor(() => {
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });
  });

  it('should render recent activity component', async () => {
    renderDashboardPage();
    
    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
  });

  it('should show welcome message for new users', async () => {
    vi.mocked(apiClient.getLabelStats).mockResolvedValue({
      success: true,
      data: { stats: { ...mockStats, total_labels: 0 } },
    } as any);

    renderDashboardPage();
    
    await waitFor(() => {
      expect(screen.getByText('Welcome to Cable Manager!')).toBeInTheDocument();
    });

    expect(screen.getByText('Get started by creating your first site and then generate your first cable label.')).toBeInTheDocument();
  });

  it('should not show welcome message for existing users', async () => {
    renderDashboardPage();
    
    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument();
    });

    expect(screen.queryByText('Welcome to Cable Manager!')).not.toBeInTheDocument();
  });

  it('should handle API errors gracefully', async () => {
    vi.mocked(apiClient.getLabelStats).mockRejectedValue(
      new Error('API Error')
    );
    vi.mocked(apiClient.getSites).mockRejectedValue(
      new Error('API Error')
    );

    renderDashboardPage();
    
    // Should still render the page structure
    expect(screen.getByText(/Good \w+, John!/)).toBeInTheDocument();
    expect(screen.getByText('Total Labels')).toBeInTheDocument();
  });

  it('should call APIs with correct parameters', async () => {
    renderDashboardPage();

    await waitFor(() => {
      expect(apiClient.getSites).toHaveBeenCalled();
      // First accessible site should be used for stats/recents.
      expect(apiClient.getLabelStats).toHaveBeenCalledWith(1);
      expect(apiClient.getRecentLabels).toHaveBeenCalledWith(1, 5);
    });
  });

  it('should display correct greeting based on time of day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T09:00:00Z'));

    renderDashboardPage();
    expect(screen.getByText('Good morning, John!')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('should show admin no-sites onboarding with CTA', async () => {
    mockRole = 'ADMIN';
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: { sites: [] },
    } as any);

    renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText('Get Started')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Create Your First Site/i })).toBeInTheDocument();
    });
  });

  it('should show user no-sites message without CTA', async () => {
    mockRole = 'USER';
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: { sites: [] },
    } as any);

    renderDashboardPage();

    await waitFor(() => {
      expect(screen.getByText('No Sites Available')).toBeInTheDocument();
      expect(screen.getByText(/Please ask an Admin to grant you access/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Create Your First Site/i)).not.toBeInTheDocument();
  });
});