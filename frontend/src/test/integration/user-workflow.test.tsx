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
    getSites: vi.fn(),
    createSite: vi.fn(),
    getLabels: vi.fn(),
    createLabel: vi.fn(),
    getRecentLabels: vi.fn(),
    getLabelStats: vi.fn(),
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

describe('User Workflow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should redirect unauthenticated users to login', async () => {
    const { apiClient } = await import('../../lib/api');
    
    // Mock no stored tokens
    vi.mocked(apiClient.getCurrentUser).mockRejectedValue(new Error('Unauthorized'));

    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });
  });

  it('should complete login flow and redirect to dashboard', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    // Mock successful login
    vi.mocked(apiClient.login).mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 1,
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'user',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 3600,
      },
    });

    // Mock dashboard data
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: { sites: [], pagination: { total: 0 } },
    });

    vi.mocked(apiClient.getRecentLabels).mockResolvedValue({
      success: true,
      data: { labels: [] },
    });

    vi.mocked(apiClient.getLabelStats).mockResolvedValue({
      success: true,
      data: { stats: { total_labels: 0, total_sites: 0, monthly_labels: 0 } },
    });

    renderApp();

    // Wait for login form
    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });

    // Fill in login form
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const loginButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(loginButton);

    // Should redirect to dashboard
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('should allow authenticated users to create a site', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    // Mock authenticated user
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 1,
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'user',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    // Mock sites data
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: { sites: [], pagination: { total: 0 } },
    });

    vi.mocked(apiClient.createSite).mockResolvedValue({
      success: true,
      data: {
        site: {
          id: 1,
          name: 'Test Site',
          location: 'Test Location',
          description: 'Test Description',
          user_id: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    renderApp();

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Navigate to sites page
    const sitesLink = screen.getByRole('link', { name: /sites/i });
    await user.click(sitesLink);

    // Wait for sites page
    await waitFor(() => {
      expect(screen.getByText('Sites')).toBeInTheDocument();
    });

    // Click create site button
    const createButton = screen.getByRole('button', { name: /create site/i });
    await user.click(createButton);

    // Fill in site form
    const nameInput = screen.getByLabelText(/site name/i);
    const locationInput = screen.getByLabelText(/location/i);
    const descriptionInput = screen.getByLabelText(/description/i);

    await user.type(nameInput, 'Test Site');
    await user.type(locationInput, 'Test Location');
    await user.type(descriptionInput, 'Test Description');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    // Verify API was called
    expect(apiClient.createSite).toHaveBeenCalledWith({
      name: 'Test Site',
      location: 'Test Location',
      description: 'Test Description',
    });
  });

  it('should allow users to create labels', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    // Mock authenticated user
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 1,
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'user',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    // Mock sites data
    const mockSite = {
      id: 1,
      name: 'Test Site',
      location: 'Test Location',
      description: 'Test Description',
      user_id: 1,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: { sites: [mockSite], pagination: { total: 1 } },
    });

    vi.mocked(apiClient.createLabel).mockResolvedValue({
      success: true,
      data: {
        label: {
          id: 1,
          reference_number: 'TEST-001',
          source: 'Server A',
          destination: 'Switch B',
          site_id: 1,
          user_id: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    renderApp();

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Navigate to labels page
    const labelsLink = screen.getByRole('link', { name: /labels/i });
    await user.click(labelsLink);

    // Wait for labels page
    await waitFor(() => {
      expect(screen.getByText('Labels')).toBeInTheDocument();
    });

    // Click create label button
    const createButton = screen.getByRole('button', { name: /create label/i });
    await user.click(createButton);

    // Fill in label form
    const sourceInput = screen.getByLabelText(/source/i);
    const destinationInput = screen.getByLabelText(/destination/i);

    await user.type(sourceInput, 'Server A');
    await user.type(destinationInput, 'Switch B');

    // Select site
    const siteSelect = screen.getByRole('combobox', { name: /site/i });
    await user.click(siteSelect);
    
    const siteOption = screen.getByText('Test Site');
    await user.click(siteOption);

    // Submit form
    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    // Verify API was called
    expect(apiClient.createLabel).toHaveBeenCalledWith({
      source: 'Server A',
      destination: 'Switch B',
      site_id: 1,
    });
  });
});