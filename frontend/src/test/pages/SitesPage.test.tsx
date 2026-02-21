import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SitesPage from '../../pages/SitesPage';
import { apiClient } from '../../lib/api';

// Mock the child components
vi.mock('../../components/sites/SiteList', () => ({
  default: ({ onCreateSite }: any) => (
    <div data-testid="site-list">
      <button onClick={onCreateSite}>Create Site</button>
    </div>
  ),
}));

vi.mock('../../components/sites/SiteForm', () => ({
  default: ({ onSubmit, onCancel }: any) => (
    <div data-testid="site-form">
      <button onClick={() => onSubmit({ name: 'New Site', code: 'NS', location: 'New Location' })}>Submit</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

describe('SitesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.createSite).mockResolvedValue({ success: true, data: { site: { id: 1 } } });
  });

  it('should render site list by default', () => {
    render(<SitesPage />);
    expect(screen.getByTestId('site-list')).toBeInTheDocument();
  });

  it('should open create dialog when create button is clicked', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    await user.click(screen.getByText('Create Site'));

    expect(screen.getByText('Create New Site')).toBeInTheDocument();
    expect(screen.getByTestId('site-form')).toBeInTheDocument();
  });

  it('should create site successfully', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    // Open create dialog
    await user.click(screen.getByText('Create Site'));

    // Submit form
    await user.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(apiClient.createSite).toHaveBeenCalledWith({
        name: 'New Site',
        code: 'NS',
        location: 'New Location',
      });
    });

    // Dialog should close
    expect(screen.queryByText('Create New Site')).not.toBeInTheDocument();
  });

  it('should handle create site error', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.createSite).mockRejectedValue(new Error('Create failed'));

    render(<SitesPage />);

    // Open create dialog
    await user.click(screen.getByText('Create Site'));

    // Submit form
    await user.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(screen.getByText('Create failed')).toBeInTheDocument();
    });
  });

  it('should close dialogs when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    // Test create dialog cancel
    await user.click(screen.getByText('Create Site'));
    expect(screen.getByText('Create New Site')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create New Site')).not.toBeInTheDocument();
  });
});