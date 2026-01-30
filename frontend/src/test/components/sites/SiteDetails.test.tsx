import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SiteDetails from '../../../components/sites/SiteDetails';
import { apiClient } from '../../../lib/api';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

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
    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Jan 1, 2024/)).toBeInTheDocument(); // created date
      expect(screen.getByText(/Jan 2, 2024/)).toBeInTheDocument(); // updated date
    });
  });

  it('should call onEdit when edit button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

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

    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    const deleteButton = screen.getByText('Delete');
    await user.click(deleteButton);

    expect(mockProps.onDelete).toHaveBeenCalledWith(siteWithoutLabels);
  });

  it('should allow delete button click even when site has labels', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    const deleteButton = screen.getByText('Delete');
    expect(deleteButton).toBeEnabled();
    await user.click(deleteButton);
    expect(mockProps.onDelete).toHaveBeenCalledWith(mockSite);
  });

  it('should not show a persistent delete warning', async () => {
    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    expect(screen.queryByText(/cannot be deleted/i)).not.toBeInTheDocument();
  });

  it('should call onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    const backButton = screen.getByText('Back to Sites');
    await user.click(backButton);

    expect(mockProps.onBack).toHaveBeenCalled();
  });

  it('should show loading state initially', () => {
    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );
    expect(screen.getByText('Loading site details...')).toBeInTheDocument();
  });

  it('should handle API error', async () => {
    vi.mocked(apiClient.getSite).mockRejectedValue(new Error('API Error'));

    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

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

    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

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

    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No labels yet')).toBeInTheDocument();
      expect(screen.getByText('Create First Label')).toBeInTheDocument();
    });
  });

  it('should show labels statistics when labels exist', async () => {
    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    // Check for the label count in the statistics section
    const labelCountElements = screen.getAllByText('5');
    expect(labelCountElements.length).toBeGreaterThan(0);
  });

  it('should navigate to create label with site_id when create buttons are clicked', async () => {
    const user = userEvent.setup();
    const siteWithoutLabels = { ...mockSite, label_count: 0 };
    vi.mocked(apiClient.getSite).mockResolvedValue({
      success: true,
      data: { site: siteWithoutLabels },
    });

    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create First Label'));
    expect(mockNavigate).toHaveBeenCalledWith('/labels?mode=create&site_id=1');
  });

  it('should navigate to labels list filtered by site_id', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SiteDetails {...mockProps} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Site' })).toBeInTheDocument();
    });

    await user.click(screen.getByText('View All Labels'));
    expect(mockNavigate).toHaveBeenCalledWith('/labels?site_id=1');
  });
});