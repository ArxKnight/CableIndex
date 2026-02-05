import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../App';

// Mock the API client
vi.mock('../../lib/api', () => ({
  ApiError: class ApiError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
  default: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    getSites: vi.fn(),
    createSite: vi.fn(),
    getLabels: vi.fn(),
    createLabel: vi.fn(),
    getSiteCableTypes: vi.fn(),
    createSiteCableType: vi.fn(),
    updateSiteCableType: vi.fn(),
    deleteSiteCableType: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  apiClient: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    getSites: vi.fn(),
    createSite: vi.fn(),
    getLabels: vi.fn(),
    createLabel: vi.fn(),
    getSiteCableTypes: vi.fn(),
    createSiteCableType: vi.fn(),
    updateSiteCableType: vi.fn(),
    deleteSiteCableType: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
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

describe('Error Scenarios Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    const current = (globalThis as any).__TEST_AUTH__;
    (globalThis as any).__TEST_AUTH__ = {
      ...current,
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
    };

    window.history.pushState({}, '', '/');
  });

  it('should handle login errors gracefully', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    const loginMock = vi.fn(async () => {
      throw new Error('Invalid credentials');
    });
    (globalThis as any).__TEST_AUTH__ = {
      ...(globalThis as any).__TEST_AUTH__,
      login: loginMock,
    };

    // The LoginForm calls AuthContext.login, which is overridden above.
    // Keep apiClient.login mocked to avoid accidental calls.
    vi.mocked(apiClient.login).mockRejectedValue(new Error('Invalid credentials'));

    renderApp();

    // Wait for login form
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    // Fill in login form with invalid credentials
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);
    const loginButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'invalid@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(loginButton);

    // Should show inline error
    await waitFor(() => {
      expect(screen.getByText(/incorrect email or password\./i)).toBeInTheDocument();
    });

    // Should remain on login page
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should handle network errors during data fetching', async () => {
    const { apiClient } = await import('../../lib/api');

    (globalThis as any).__TEST_AUTH__ = {
      ...(globalThis as any).__TEST_AUTH__,
      user: {
        id: 1,
        email: 'test@example.com',
        username: 'Test User',
        role: 'USER',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      tokens: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
      },
      isAuthenticated: true,
      isLoading: false,
    };

    // Mock authenticated user
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 1,
          email: 'test@example.com',
          username: 'Test User',
          role: 'user',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      },
    });

    // Mock network error for sites
    vi.mocked(apiClient.getSites).mockRejectedValue(new Error('Network error'));

    renderApp();

    // Should show error state on the Sites page
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    });

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('should handle form validation errors', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    (globalThis as any).__TEST_AUTH__ = {
      ...(globalThis as any).__TEST_AUTH__,
      user: {
        id: 1,
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'USER',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      tokens: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
      },
      isAuthenticated: true,
      isLoading: false,
    };

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

    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: { sites: [], pagination: { total: 0 } },
    });

    renderApp();

    // Wait for sites page
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    });

    // Click create site button
    const createButton = screen.getByRole('button', { name: /create site/i });
    await user.click(createButton);

    await screen.findByText('Create New Site');

    // Try to submit form without filling required fields
    const submitButton = screen
      .getAllByRole('button', { name: /^create site$/i })
      .find((btn) => btn.getAttribute('type') === 'submit');

    if (!submitButton) {
      throw new Error('Expected to find a submit button for "Create Site"');
    }
    await user.click(submitButton);

    // Should show validation errors
    await waitFor(() => {
      expect(screen.getByText(/site name is required/i)).toBeInTheDocument();
    });
  });

  it('should handle API errors during form submission', async () => {
    const { apiClient } = await import('../../lib/api');
    const user = userEvent.setup();

    (globalThis as any).__TEST_AUTH__ = {
      ...(globalThis as any).__TEST_AUTH__,
      user: {
        id: 1,
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'USER',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      tokens: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
      },
      isAuthenticated: true,
      isLoading: false,
    };

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

    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: { sites: [], pagination: { total: 0 } },
    });

    // Mock API error for site creation
    vi.mocked(apiClient.createSite).mockRejectedValue(new Error('Site name already exists'));

    renderApp();

    // Wait for sites page
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    });

    // Click create site button
    const createButton = screen.getByRole('button', { name: /create site/i });
    await user.click(createButton);

    await screen.findByText('Create New Site');

    // Fill in site form
    const nameInput = screen.getByLabelText(/site name/i);
    const codeInput = screen.getByLabelText(/abbreviation/i);
    await user.type(nameInput, 'Duplicate Site');
    await user.type(codeInput, 'DUP');

    // Submit form
    const submitButton = screen
      .getAllByRole('button', { name: /^create site$/i })
      .find((btn) => btn.getAttribute('type') === 'submit');

    if (!submitButton) {
      throw new Error('Expected to find a submit button for "Create Site"');
    }
    await user.click(submitButton);

    // Should show API error message
    await waitFor(() => {
      expect(screen.getByText('Site name already exists')).toBeInTheDocument();
    });
  });

  it('should handle session expiration', async () => {
    const { apiClient } = await import('../../lib/api');

    (globalThis as any).__TEST_AUTH__ = {
      ...(globalThis as any).__TEST_AUTH__,
      user: {
        id: 1,
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'USER',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      tokens: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
      },
      isAuthenticated: true,
      isLoading: false,
    };

    // Mock initial authentication success
    vi.mocked(apiClient.getCurrentUser).mockResolvedValueOnce({
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

    // Mock session expiration on subsequent calls
    vi.mocked(apiClient.getSites).mockRejectedValue(new Error('Session expired. Please login again.'));

    renderApp();

    // Wait for app shell to load
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sites' })).toBeInTheDocument();
    });

    expect(screen.getByText('Session expired. Please login again.')).toBeInTheDocument();
  });

  it('should handle 404 routes gracefully', async () => {
    const { apiClient } = await import('../../lib/api');

    (globalThis as any).__TEST_AUTH__ = {
      ...(globalThis as any).__TEST_AUTH__,
      user: {
        id: 1,
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'USER',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      tokens: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
      },
      isAuthenticated: true,
      isLoading: false,
    };

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

    // Manually navigate to non-existent route
    window.history.pushState({}, '', '/non-existent-route');

    renderApp();

    // Should show 404 page
    await waitFor(() => {
      expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    });

    // Should have navigation options
    expect(screen.getAllByRole('link', { name: /^sites$/i }).length).toBeGreaterThan(0);
  });
});