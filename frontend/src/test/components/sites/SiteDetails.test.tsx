import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiteDetails from '../../../components/sites/SiteDetails';
import { apiClient } from '../../../lib/api';

const mockSite = {
  id: 1,
  name: 'Test Site',
  location: 'Test Location',
  description: 'Test Description',
  user_id: 1,
  created_at: '2024-01-01T12:00:00Z',
  updated_at: '2024-01-02T12:00:00Z',
  label_count: 5,
};

const mockProps = {
  siteId: 1,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onBack: vi.fn(),
};

describe('SiteDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getSite).mockResolvedValue({
      success: true,
      data: { site: mockSite },
    });
  });

  it('should render site details', async () => {
    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
      expect(screen.getByText('Test Location')).toBeInTheDocument();
      expect(screen.getByText('Test Description')).toBeInTheDocument();
      // Check for label count in statistics section
      const labelCountElements = screen.getAllByText('5');
      expect(labelCountElements.length).toBeGreaterThan(0);
    });
  });

  it('should format dates correctly', async () => {
    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Jan 1, 2024/)).toBeInTheDocument(); // created date
      expect(screen.getByText(/Jan 2, 2024/)).toBeInTheDocument(); // updated date
    });
  });

  it('should call onEdit when edit button is clicked', async () => {
    const user = userEvent.setup();
    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    const editButton = screen.getByText('Edit');
    await user.click(editButton);

    expect(mockProps.onEdit).toHaveBeenCalledWith(mockSite);
  });

  it('should call onDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    const siteWithoutLabels = { ...mockSite, label_count: 0 };
    vi.mocked(apiClient.getSite).mockResolvedValue({
      success: true,
      data: { site: siteWithoutLabels },
    });

    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    const deleteButton = screen.getByText('Delete');
    await user.click(deleteButton);

    expect(mockProps.onDelete).toHaveBeenCalledWith(siteWithoutLabels);
  });

  it('should disable delete button when site has labels', async () => {
    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    const deleteButton = screen.getByText('Delete');
    expect(deleteButton).toBeDisabled();
  });

  it('should show delete warning when site has labels', async () => {
    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText(/cannot be deleted because it has 5 associated labels/i)).toBeInTheDocument();
    });
  });

  it('should not show delete warning when site has no labels', async () => {
    const siteWithoutLabels = { ...mockSite, label_count: 0 };
    vi.mocked(apiClient.getSite).mockResolvedValue({
      success: true,
      data: { site: siteWithoutLabels },
    });

    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    expect(screen.queryByText(/cannot be deleted/i)).not.toBeInTheDocument();
  });

  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    const backButton = screen.getByText('Back to Sites');
    await user.click(backButton);

    expect(mockProps.onBack).toHaveBeenCalled();
  });

  it('should show loading state initially', () => {
    render(<SiteDetails {...mockProps} />);
    expect(screen.getByText('Loading site details...')).toBeInTheDocument();
  });

  it('should handle API error', async () => {
    vi.mocked(apiClient.getSite).mockRejectedValue(new Error('API Error'));

    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument();
      expect(screen.getByText('Back to Sites')).toBeInTheDocument();
    });
  });

  it('should handle site not found', async () => {
    vi.mocked(apiClient.getSite).mockResolvedValue({
      success: false,
      error: 'Site not found',
    });

    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Site not found')).toBeInTheDocument();
    });
  });

  it('should show empty labels state when no labels exist', async () => {
    const siteWithoutLabels = { ...mockSite, label_count: 0 };
    vi.mocked(apiClient.getSite).mockResolvedValue({
      success: true,
      data: { site: siteWithoutLabels },
    });

    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('No labels yet')).toBeInTheDocument();
      expect(screen.getByText('Create First Label')).toBeInTheDocument();
    });
  });

  it('should show labels statistics when labels exist', async () => {
    render(<SiteDetails {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    // Check for the label count in the statistics section
    const labelCountElements = screen.getAllByText('5');
    expect(labelCountElements.length).toBeGreaterThan(0);
  });
});