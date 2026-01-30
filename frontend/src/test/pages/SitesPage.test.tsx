import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SitesPage from '../../pages/SitesPage';
import { apiClient } from '../../lib/api';

// Mock the child components
vi.mock('../../components/sites/SiteList', () => ({
  default: ({ onCreateSite, onEditSite, onDeleteSite, onViewDetails }: any) => (
    <div data-testid="site-list">
      <button onClick={onCreateSite}>Create Site</button>
      <button onClick={() => onEditSite({ id: 1, name: 'Test Site' })}>Edit Site</button>
      <button onClick={() => onDeleteSite({ id: 1, name: 'Test Site', label_count: 0 })}>Delete Site</button>
      <button onClick={() => onDeleteSite({ id: 2, name: 'Danger Site', label_count: 3 })}>Delete Site With Labels</button>
      <button onClick={() => onViewDetails(1)}>View Details</button>
    </div>
  ),
}));

vi.mock('../../components/sites/SiteDetails', () => ({
  default: ({ onEdit, onDelete, onBack }: any) => (
    <div data-testid="site-details">
      <button onClick={() => onEdit({ id: 1, name: 'Test Site' })}>Edit from Details</button>
      <button onClick={() => onDelete({ id: 1, name: 'Test Site', label_count: 0 })}>Delete from Details</button>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

vi.mock('../../components/sites/SiteForm', () => ({
  default: ({ onSubmit, onCancel }: any) => (
    <div data-testid="site-form">
      <button onClick={() => onSubmit({ name: 'New Site', location: 'New Location' })}>Submit</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

describe('SitesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.createSite).mockResolvedValue({ success: true, data: { site: { id: 1 } } });
    vi.mocked(apiClient.updateSite).mockResolvedValue({ success: true, data: { site: { id: 1 } } });
    vi.mocked(apiClient.deleteSite).mockResolvedValue({ success: true });
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

  it('should open edit dialog when edit button is clicked', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    await user.click(screen.getByText('Edit Site'));

    expect(screen.getByRole('heading', { name: 'Edit Site' })).toBeInTheDocument();
    expect(screen.getByTestId('site-form')).toBeInTheDocument();
  });

  it('should open delete dialog when delete button is clicked', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    await user.click(screen.getByText('Delete Site'));

    expect(screen.getByRole('heading', { name: /delete site/i })).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
  });

  it('should switch to details view when view details is clicked', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    await user.click(screen.getByText('View Details'));

    expect(screen.getByTestId('site-details')).toBeInTheDocument();
    expect(screen.queryByTestId('site-list')).not.toBeInTheDocument();
  });

  it('should return to list view when back button is clicked', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    // Go to details view
    await user.click(screen.getByText('View Details'));
    expect(screen.getByTestId('site-details')).toBeInTheDocument();

    // Go back to list
    await user.click(screen.getByText('Back'));
    expect(screen.getByTestId('site-list')).toBeInTheDocument();
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
        location: 'New Location',
      });
    });

    // Dialog should close
    expect(screen.queryByText('Create New Site')).not.toBeInTheDocument();
  });

  it('should update site successfully', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    // Open edit dialog
    await user.click(screen.getByText('Edit Site'));

    // Submit form
    await user.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(apiClient.updateSite).toHaveBeenCalledWith(1, {
        name: 'New Site',
        location: 'New Location',
      });
    });

    // Dialog should close
    expect(screen.queryByRole('heading', { name: 'Edit Site' })).not.toBeInTheDocument();
  });

  it('should delete site successfully', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    // Open delete dialog
    await user.click(screen.getByText('Delete Site'));

    // Confirm deletion
    const deleteButtons = screen.getAllByRole('button', { name: /delete site/i });
    const confirmDeleteButton = deleteButtons.find(btn => btn.className.includes('bg-destructive'));
    await user.click(confirmDeleteButton!);

    await waitFor(() => {
      expect(apiClient.deleteSite).toHaveBeenCalledWith(1, { cascade: false });
    });

    // Dialog should close
    expect(screen.queryByRole('heading', { name: /delete site/i })).not.toBeInTheDocument();
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

  it('should handle update site error', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.updateSite).mockRejectedValue(new Error('Update failed'));

    render(<SitesPage />);

    // Open edit dialog
    await user.click(screen.getByText('Edit Site'));

    // Submit form
    await user.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });

  it('should handle delete site error', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.deleteSite).mockRejectedValue(new Error('Delete failed'));

    render(<SitesPage />);

    // Open delete dialog
    await user.click(screen.getByText('Delete Site'));

    // Confirm deletion
    const deleteButtons = screen.getAllByRole('button', { name: /delete site/i });
    const confirmDeleteButton = deleteButtons.find(btn => btn.className.includes('bg-destructive'));
    await user.click(confirmDeleteButton!);

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
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

    // Test delete dialog cancel
    await user.click(screen.getByText('Delete Site'));
    expect(screen.getByRole('heading', { name: /delete site/i })).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('heading', { name: /delete site/i })).not.toBeInTheDocument();
  });

  it('should require typed confirmation + checkbox when site has labels', async () => {
    const user = userEvent.setup();
    render(<SitesPage />);

    await user.click(screen.getByText('Delete Site With Labels'));

    // Delete button should be disabled until confirmations are completed
    const deleteButtons = screen.getAllByRole('button', { name: /delete site/i });
    const deleteButton = deleteButtons.find(btn => btn.className.includes('bg-destructive'));
    expect(deleteButton).toBeTruthy();
    expect(deleteButton!).toBeDisabled();

    await user.type(screen.getByLabelText('Confirm site name'), 'Danger Site');
    await user.click(screen.getByLabelText(/I understand this will delete all labels/i));

    expect(deleteButton!).toBeEnabled();

    await user.click(deleteButton!);

    await waitFor(() => {
      expect(apiClient.deleteSite).toHaveBeenCalledWith(2, { cascade: true });
    });
  });
});