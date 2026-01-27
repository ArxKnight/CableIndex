import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiteList from '../../../components/sites/SiteList';
import { apiClient } from '../../../lib/api';

const mockSites = [
  {
    id: 1,
    name: 'Office Site',
    location: 'New York',
    description: 'Main office location',
    user_id: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    label_count: 5,
  },
  {
    id: 2,
    name: 'Warehouse Site',
    location: 'California',
    description: 'Storage facility',
    user_id: 1,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    label_count: 0,
  },
];

const mockProps = {
  onCreateSite: vi.fn(),
  onEditSite: vi.fn(),
  onDeleteSite: vi.fn(),
  onViewDetails: vi.fn(),
};

describe('SiteList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: {
        sites: mockSites,
        pagination: { total: 2, limit: 50, offset: 0, has_more: false },
      },
    });
  });

  it('should render sites list', async () => {
    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Office Site')).toBeInTheDocument();
      expect(screen.getByText('Warehouse Site')).toBeInTheDocument();
    });

    expect(screen.getByText('5 labels')).toBeInTheDocument();
    expect(screen.getByText('0 labels')).toBeInTheDocument();
  });

  it('should handle search functionality', async () => {
    const user = userEvent.setup();
    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Office Site')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search sites/i);
    await user.type(searchInput, 'Office');

    await waitFor(() => {
      expect(apiClient.getSites).toHaveBeenCalledWith({
        search: 'Office',
        include_counts: true,
        limit: 50,
      });
    });
  });

  it('should handle filter functionality', async () => {
    const user = userEvent.setup();
    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Office Site')).toBeInTheDocument();
    });

    const filterSelect = screen.getByDisplayValue('All Sites');
    await user.selectOptions(filterSelect, 'with_labels');

    await waitFor(() => {
      expect(screen.getByText('Office Site')).toBeInTheDocument();
      expect(screen.queryByText('Warehouse Site')).not.toBeInTheDocument();
    });
  });

  it('should handle sorting functionality', async () => {
    const user = userEvent.setup();
    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Office Site')).toBeInTheDocument();
    });

    const sortSelect = screen.getByDisplayValue('Sort by Name');
    await user.selectOptions(sortSelect, 'label_count');

    // Should trigger re-render with sorted data
    await waitFor(() => {
      expect(screen.getByText('Office Site')).toBeInTheDocument();
    });
  });

  it('should call onCreateSite when create button is clicked', async () => {
    const user = userEvent.setup();
    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Create Site')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create Site'));
    expect(mockProps.onCreateSite).toHaveBeenCalled();
  });

  it('should call onEditSite when edit button is clicked', async () => {
    const user = userEvent.setup();
    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Office Site')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle('Edit Site');
    await user.click(editButtons[0]);
    expect(mockProps.onEditSite).toHaveBeenCalledWith(mockSites[0]);
  });

  it('should call onDeleteSite when delete button is clicked', async () => {
    const user = userEvent.setup();
    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Office Site')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle('Delete Site');
    await user.click(deleteButtons[0]);
    expect(mockProps.onDeleteSite).toHaveBeenCalledWith(mockSites[0]);
  });

  it('should call onViewDetails when site name is clicked', async () => {
    const user = userEvent.setup();
    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Office Site')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Office Site'));
    expect(mockProps.onViewDetails).toHaveBeenCalledWith(1);
  });

  it('should display empty state when no sites exist', async () => {
    vi.mocked(apiClient.getSites).mockResolvedValue({
      success: true,
      data: {
        sites: [],
        pagination: { total: 0, limit: 50, offset: 0, has_more: false },
      },
    });

    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('No sites found')).toBeInTheDocument();
      expect(screen.getByText('Create Your First Site')).toBeInTheDocument();
    });
  });

  it('should display error state when API call fails', async () => {
    vi.mocked(apiClient.getSites).mockRejectedValue(new Error('API Error'));

    render(<SiteList {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    render(<SiteList {...mockProps} />);
    expect(screen.getByText('Loading sites...')).toBeInTheDocument();
  });
});