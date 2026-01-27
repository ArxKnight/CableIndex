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
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      email: 'test@example.com',
      full_name: 'John Doe',
      role: 'user',
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

const mockSitesResponse = {
  sites: [],
  pagination: {
    total: 3,
  },
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
    
    // Mock successful API responses by default
    vi.mocked(apiClient.getLabelStats).mockResolvedValue({
      success: true,
      data: { stats: mockStats },
    });
    
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: mockSitesResponse,
    });
    
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({
      success: true,
      data: { labels: [] },
    });
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
    vi.mocked(apiClient.getLabelStats).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );
    vi.mocked(apiClient.getSites).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderDashboardPage();
    
    expect(screen.getAllByText('...')).toHaveLength(4);
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
    });

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

  it('should call APIs with correct parameters', () => {
    renderDashboardPage();
    
    expect(apiClient.getLabelStats).toHaveBeenCalled();
    expect(apiClient.getSites).toHaveBeenCalledWith({
      limit: 1,
      include_counts: true,
    });
    expect(apiClient.getRecentLabels).toHaveBeenCalledWith(5);
  });

  it('should display correct greeting based on time of day', () => {
    // Mock different times of day
    const originalDate = Date;
    
    // Test morning (9 AM)
    vi.spyOn(globalThis, 'Date').mockImplementation(((...args: any[]) => {
      if (args.length === 0) {
        const mockDate = new originalDate('2024-01-15T09:00:00Z');
        mockDate.getHours = () => 9;
        return mockDate;
      }
      return new (originalDate as any)(...args);
    }) as any);

    renderDashboardPage();
    expect(screen.getByText('Good morning, John!')).toBeInTheDocument();
    
    vi.restoreAllMocks();
  });
});