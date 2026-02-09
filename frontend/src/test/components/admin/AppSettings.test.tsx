import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppSettings from '../../../components/admin/AppSettings';
import { apiClient } from '../../../lib/api';

// Mock the API client
vi.mock('../../../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSettings = {
  default_user_role: 'user',
  maintenance_mode: false,
  maintenance_message: 'System under maintenance',
  smtp_host: 'smtp.example.com',
  smtp_port: 587,
  smtp_username: 'user@example.com',
  smtp_password_set: true,
  smtp_from: 'CableIndex <noreply@example.com>',
  smtp_secure: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

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

describe('AppSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({ data: { settings: mockSettings } } as any);
  });

  it('renders settings form with current values', async () => {
    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('smtp.example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('587')).toBeInTheDocument();
      expect(screen.getByDisplayValue('user@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('CableIndex <noreply@example.com>')).toBeInTheDocument();
    });

    // Check section headers
    expect(screen.getByText('Email (SMTP)')).toBeInTheDocument();
  });

  it('shows unsaved changes alert when form is modified', async () => {
    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('smtp.example.com')).toBeInTheDocument();
    });

    // Modify a field
    const smtpHostInput = screen.getByLabelText(/smtp host/i);
    fireEvent.change(smtpHostInput, { target: { value: 'smtp2.example.com' } });

    await waitFor(() => {
      expect(screen.getByText(/You have unsaved changes/)).toBeInTheDocument();
    });
  });

  it('submits form with updated settings', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} } as any);

    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('smtp.example.com')).toBeInTheDocument();
    });

    // Modify a field
    const smtpPortInput = screen.getByLabelText(/smtp port/i);
    fireEvent.change(smtpPortInput, { target: { value: '2525' } });

    // Submit form
    const saveButton = screen.getByRole('button', { name: /save settings/i });

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/admin/settings', expect.objectContaining({
        smtp_port: 2525,
      }));
    });
  });

  it('resets form to original values', async () => {
    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByDisplayValue('smtp.example.com')).toBeInTheDocument();
    });

    // Modify a field
    const smtpHostInput = screen.getByLabelText(/smtp host/i);
    await user.clear(smtpHostInput);
    await user.type(smtpHostInput, 'smtp2.example.com');

    await waitFor(() => {
      expect(screen.getByText(/You have unsaved changes/)).toBeInTheDocument();
    });

    // Reset form
    const resetButton = screen.getByRole('button', { name: /reset/i });
    await waitFor(() => {
      expect(resetButton).not.toBeDisabled();
    });
    await user.click(resetButton);

    await waitFor(() => {
      expect(screen.getByLabelText(/smtp host/i)).toHaveValue('smtp.example.com');
      expect(screen.queryByText(/You have unsaved changes/)).not.toBeInTheDocument();
      expect(resetButton).toBeDisabled();
    });
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(apiClient.put).mockRejectedValue(new Error('Failed to update settings'));

    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('smtp.example.com')).toBeInTheDocument();
    });

    // Modify and submit
    const smtpHostInput = screen.getByLabelText(/smtp host/i);
    fireEvent.change(smtpHostInput, { target: { value: 'smtp2.example.com' } });

    const saveButton = screen.getByRole('button', { name: /save settings/i });

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalled();
    });
  });

  it('sends a test email', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as any);

    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /test email/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /test email/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/admin/settings/test-email', {});
    });
  });

  it('shows loading state when fetching settings', () => {
    vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {})); // Never resolves

    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    // Form should be in loading state (inputs disabled or loading indicators)
    expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();
  });

  it('shows error state when failing to load settings', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Failed to load settings'));

    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load settings/)).toBeInTheDocument();
    });
  });
});