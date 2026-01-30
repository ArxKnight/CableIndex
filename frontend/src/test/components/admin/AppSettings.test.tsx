import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppSettings from '../../../components/admin/AppSettings';
import { apiClient } from '../../../lib/api';

// Mock the API client
vi.mock('../../../lib/api', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
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
  max_labels_per_user: 1000,
  max_sites_per_user: 50,
  maintenance_mode: false,
  maintenance_message: 'System under maintenance',
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
    vi.mocked(apiClient.get).mockResolvedValue({
      success: true,
      data: { settings: mockSettings },
    });
  });

  it('renders settings form with current values', async () => {
    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    });

    // Check section headers
    expect(screen.getByText('System Limits')).toBeInTheDocument();
    expect(screen.queryByText('System Information')).not.toBeInTheDocument();
    expect(screen.getByText('Maintenance Mode')).toBeInTheDocument();
  });

  it('shows unsaved changes alert when form is modified', async () => {
    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    });

    // Modify a field
    const maxLabelsInput = screen.getByLabelText('Max Labels per User');
    fireEvent.change(maxLabelsInput, { target: { value: '999' } });

    await waitFor(() => {
      expect(screen.getByText(/You have unsaved changes/)).toBeInTheDocument();
    });
  });

  it('shows maintenance message field when maintenance mode is enabled', async () => {
    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.queryByLabelText('Maintenance Message')).not.toBeInTheDocument();
    });

    // Enable maintenance mode
    const maintenanceSwitch = screen.getByRole('switch', { name: /enable maintenance mode/i });
    fireEvent.click(maintenanceSwitch);

    await waitFor(() => {
      expect(screen.getByLabelText('Maintenance Message')).toBeInTheDocument();
    });
  });

  it('changes default user role', async () => {
    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      const roleSelect = screen.getByRole('combobox');
      expect(roleSelect).toBeInTheDocument();
    });

    // Click the role dropdown
    const roleSelect = screen.getByRole('combobox');
    fireEvent.click(roleSelect);

    // Select moderator
    const moderatorOption = screen.getByText('Moderator');
    fireEvent.click(moderatorOption);

    // Verify selection
    expect(screen.getByText('Moderator')).toBeInTheDocument();
  });

  it('submits form with updated settings', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({
      success: true,
      message: 'Settings updated successfully',
    });

    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    });

    // Modify a field
    const maxLabelsInput = screen.getByLabelText('Max Labels per User');
    fireEvent.change(maxLabelsInput, { target: { value: '999' } });

    // Submit form
    const saveButton = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith('/admin/settings', expect.objectContaining({
        max_labels_per_user: 999,
      }));
    });
  });

  it('resets form to original values', async () => {
    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    });

    // Modify a field
    const maxLabelsInput = screen.getByLabelText('Max Labels per User');
    fireEvent.change(maxLabelsInput, { target: { value: '999' } });

    // Reset form
    const resetButton = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetButton);

    await waitFor(() => {
      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      expect(screen.queryByText(/You have unsaved changes/)).not.toBeInTheDocument();
    });
  });

  it('validates required fields', async () => {
    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    });

    // max_labels_per_user must be >= 0
    const maxLabelsInput = screen.getByLabelText('Max Labels per User');
    fireEvent.change(maxLabelsInput, { target: { value: '-1' } });

    // Try to submit
    const saveButton = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(saveButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/greater than or equal to 0|at least 0|min/i)).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(apiClient.put).mockRejectedValue(new Error('Failed to update settings'));

    const Wrapper = createWrapper();
    render(<AppSettings />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    });

    // Modify and submit
    const maxLabelsInput = screen.getByLabelText('Max Labels per User');
    fireEvent.change(maxLabelsInput, { target: { value: '999' } });

    const saveButton = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalled();
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