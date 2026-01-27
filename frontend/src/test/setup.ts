import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock API client
vi.mock('../lib/api', () => ({
  apiClient: {
    getSites: vi.fn(),
    getSite: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
  },
}));

// Mock React Router
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/' }),
  };
});

// Mock AuthContext
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com', full_name: 'Test User' },
    session: { access_token: 'test-token' },
    loading: false,
  }),
}));