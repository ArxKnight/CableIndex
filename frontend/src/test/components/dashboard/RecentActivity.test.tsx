import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecentActivity from '../../../components/dashboard/RecentActivity';
import { apiClient } from '../../../lib/api';

// Mock the API client
vi.mock('../../../lib/api', () => ({
  apiClient: {
    getSites: vi.fn(),
    getRecentLabels: vi.fn(),
  },
}));

const mockRecentLabels = [
  {
    id: 1,
    reference_number: 'SITE1-001',
    source: 'Server Room A',
    destination: 'Network Closet B',
    site_id: 1,
    site_name: 'Main Office',
    user_id: 1,
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:30:00Z',
    is_active: true,
  },
  {
    id: 2,
    reference_number: 'SITE1-002',
    source: 'Workstation 1',
    destination: 'Switch Port 24',
    site_id: 1,
    site_name: 'Main Office',
    user_id: 1,
    created_at: '2024-01-15T09:15:00Z',
    updated_at: '2024-01-15T09:15:00Z',
    is_active: true,
  },
];

const renderRecentActivity = () => {
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
        <RecentActivity />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('RecentActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: {
        sites: [{ id: 1, name: 'Main Office', code: 'SITE1' }],
      },
    } as any);
  });

  it('should render recent activity title', () => {
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({
      success: true,
      data: { labels: mockRecentLabels },
    } as any);

    renderRecentActivity();
    
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
  });

  it('should render view all link', () => {
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({
      success: true,
      data: { labels: mockRecentLabels },
    } as any);

    renderRecentActivity();
    
    const viewAllLink = screen.getByText('View All').closest('a');
    expect(viewAllLink).toHaveAttribute('href', '/labels');
  });

  it('should display recent labels when data is available', async () => {
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({
      success: true,
      data: { labels: mockRecentLabels },
    } as any);

    renderRecentActivity();
    
    await waitFor(() => {
      expect(screen.getByText('SITE1-001')).toBeInTheDocument();
      expect(screen.getByText('SITE1-002')).toBeInTheDocument();
    });

    expect(screen.getByText('Server Room A → Network Closet B')).toBeInTheDocument();
    expect(screen.getByText('Workstation 1 → Switch Port 24')).toBeInTheDocument();
    expect(screen.getAllByText('Main Office')).toHaveLength(2);
  });

  it('should show loading state initially', () => {
    vi.mocked(apiClient.getSites).mockImplementation(() => new Promise(() => {}) as any);

    renderRecentActivity();
    
    // Should show loading skeleton
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show empty state when no labels exist', async () => {
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({
      success: true,
      data: { labels: [] },
    } as any);

    renderRecentActivity();
    
    await waitFor(() => {
      expect(screen.getByText('No recent activity')).toBeInTheDocument();
    });

    expect(screen.getByText('Create your first label')).toBeInTheDocument();
  });

  it('should show error state when API call fails', async () => {
    vi.mocked(apiClient.getRecentLabels).mockRejectedValue(new Error('API Error'));

    renderRecentActivity();
    
    await waitFor(() => {
      expect(screen.getByText('Unable to load recent activity')).toBeInTheDocument();
    });
  });

  it('should format time correctly', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const recentLabel = {
      ...mockRecentLabels[0],
      created_at: oneHourAgo.toISOString(),
    };

    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({
      success: true,
      data: { labels: [recentLabel] },
    } as any);

    renderRecentActivity();
    
    await waitFor(() => {
      expect(screen.getByText('1h ago')).toBeInTheDocument();
    });
  });

  it('should call API with correct limit', async () => {
    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({
      success: true,
      data: { labels: mockRecentLabels },
    } as any);

    renderRecentActivity();

    await waitFor(() => {
      expect(apiClient.getSites).toHaveBeenCalledWith({ limit: 1000 });
      expect(apiClient.getRecentLabels).toHaveBeenCalledWith(1, 5);
    });
  });

  it('should show no-sites message when user has no sites', async () => {
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: { sites: [] },
    } as any);

    renderRecentActivity();

    await waitFor(() => {
      expect(screen.getByText('You do not have access to any sites')).toBeInTheDocument();
    });
  });
});