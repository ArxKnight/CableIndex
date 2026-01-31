import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Radix UI (e.g., Switch) relies on ResizeObserver; jsdom doesn't provide it.
const ResizeObserverMock = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
vi.stubGlobal('ResizeObserver', ResizeObserverMock as any);

// App performs a setup-status fetch on startup; make it deterministic in tests.
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: any) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (typeof url === 'string' && url.includes('/api/setup/status')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ setupRequired: false }),
      } as any;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as any;
  })
);

const defaultAuthState = {
  user: {
    id: 1,
    email: 'test@example.com',
    full_name: 'Test User',
    role: 'USER',
  },
  tokens: {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresIn: 3600,
  },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  updateUser: vi.fn(),
};

// Allow individual tests to override auth state without remocking
(globalThis as any).__TEST_AUTH__ = defaultAuthState;

// Mock API client (provide a wide surface area so component tests don't crash)
vi.mock('../lib/api', () => ({
  apiClient: {
    // Auth
    login: vi.fn(),
    register: vi.fn(),
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),

    // Sites
    getSites: vi.fn(),
    getSite: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),

    // Labels
    getLabels: vi.fn(),
    getLabel: vi.fn(),
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
    bulkDeleteLabels: vi.fn(),
    getLabelStats: vi.fn(),
    getRecentLabels: vi.fn(),

    // Admin
    getUsers: vi.fn(),
    updateUserRole: vi.fn(),
    deleteUser: vi.fn(),
    inviteUser: vi.fn(),
    getInvitations: vi.fn(),
    cancelInvitation: vi.fn(),
    getAdminStats: vi.fn(),
    getUserSites: vi.fn(),
    updateUserSites: vi.fn(),
    validateInvite: vi.fn(),
    acceptInvite: vi.fn(),
    getAppSettings: vi.fn(),
    updateAppSettings: vi.fn(),

    // Generic methods used by some components
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock React Router
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock AuthContext
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => (globalThis as any).__TEST_AUTH__,
  AuthProvider: ({ children }: { children: any }) => children,
}));