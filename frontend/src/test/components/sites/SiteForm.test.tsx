import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiteForm from '../../../components/sites/SiteForm';

const mockProps = {
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  isLoading: false,
};

const mockSite = {
  id: 1,
  name: 'Test Site',
  location: 'Test Location',
  description: 'Test Description',
  user_id: 1,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('SiteForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render create form with empty fields', () => {
    render(<SiteForm {...mockProps} />);

    expect(screen.getByLabelText(/site name/i)).toHaveValue('');
    expect(screen.getByLabelText(/location/i)).toHaveValue('');
    expect(screen.getByLabelText(/description/i)).toHaveValue('');
    expect(screen.getByText('Create Site')).toBeInTheDocument();
  });

  it('should render edit form with populated fields', () => {
    render(<SiteForm {...mockProps} site={mockSite} />);

    expect(screen.getByLabelText(/site name/i)).toHaveValue('Test Site');
    expect(screen.getByLabelText(/location/i)).toHaveValue('Test Location');
    expect(screen.getByLabelText(/description/i)).toHaveValue('Test Description');
    expect(screen.getByText('Update Site')).toBeInTheDocument();
  });

  it('should validate required site name field', async () => {
    const user = userEvent.setup();
    render(<SiteForm {...mockProps} />);

    const submitButton = screen.getByText('Create Site');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Site name is required')).toBeInTheDocument();
    });

    expect(mockProps.onSubmit).not.toHaveBeenCalled();
  });

  it('should validate site name length', async () => {
    const user = userEvent.setup();
    render(<SiteForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/site name/i);
    await user.type(nameInput, 'x'.repeat(101)); // Exceeds 100 character limit

    const submitButton = screen.getByText('Create Site');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Site name must be less than 100 characters')).toBeInTheDocument();
    });
  });

  it('should validate site name format', async () => {
    const user = userEvent.setup();
    render(<SiteForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/site name/i);
    await user.type(nameInput, 'Invalid@Name!');

    const submitButton = screen.getByText('Create Site');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Site name can only contain/)).toBeInTheDocument();
    });
  });

  it('should validate location length', async () => {
    const user = userEvent.setup();
    render(<SiteForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/site name/i);
    const locationInput = screen.getByLabelText(/location/i);

    await user.type(nameInput, 'Valid Site');
    await user.type(locationInput, 'x'.repeat(201)); // Exceeds 200 character limit

    const submitButton = screen.getByText('Create Site');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Location must be less than 200 characters')).toBeInTheDocument();
    });
  });

  it('should validate description length', async () => {
    const user = userEvent.setup();
    render(<SiteForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/site name/i);
    const descriptionInput = screen.getByLabelText(/description/i);

    fireEvent.change(nameInput, { target: { value: 'Valid Site' } });
    fireEvent.change(descriptionInput, { target: { value: 'x'.repeat(501) } }); // Exceeds 500 character limit

    const submitButton = screen.getByText('Create Site');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Description must be less than 500 characters')).toBeInTheDocument();
    });
  });

  it('should submit valid form data', async () => {
    const user = userEvent.setup();
    mockProps.onSubmit.mockResolvedValue(undefined);
    render(<SiteForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/site name/i);
    const locationInput = screen.getByLabelText(/location/i);
    const descriptionInput = screen.getByLabelText(/description/i);

    // Use fireEvent for more reliable input
    fireEvent.change(nameInput, { target: { value: 'New Site' } });
    fireEvent.change(locationInput, { target: { value: 'New Location' } });
    fireEvent.change(descriptionInput, { target: { value: 'New Description' } });

    const submitButton = screen.getByText('Create Site');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockProps.onSubmit).toHaveBeenCalledWith({
        name: 'New Site',
        location: 'New Location',
        description: 'New Description',
      });
    });
  });

  it('should submit form with minimal data', async () => {
    const user = userEvent.setup();
    mockProps.onSubmit.mockResolvedValue(undefined);
    render(<SiteForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/site name/i);
    fireEvent.change(nameInput, { target: { value: 'Minimal Site' } });

    const submitButton = screen.getByText('Create Site');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockProps.onSubmit).toHaveBeenCalledWith({
        name: 'Minimal Site',
        location: '',
        description: '',
      });
    });
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<SiteForm {...mockProps} />);

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockProps.onCancel).toHaveBeenCalled();
  });

  it('should disable form when loading', () => {
    render(<SiteForm {...mockProps} isLoading={true} />);

    expect(screen.getByLabelText(/site name/i)).toBeDisabled();
    expect(screen.getByLabelText(/location/i)).toBeDisabled();
    expect(screen.getByLabelText(/description/i)).toBeDisabled();
    expect(screen.getByText('Creating...')).toBeInTheDocument();
  });

  it('should show loading state for edit form', () => {
    render(<SiteForm {...mockProps} site={mockSite} isLoading={true} />);

    expect(screen.getByText('Updating...')).toBeInTheDocument();
  });

  it('should display error message when submission fails', async () => {
    const user = userEvent.setup();
    mockProps.onSubmit.mockRejectedValue(new Error('Submission failed'));
    render(<SiteForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/site name/i);
    await user.type(nameInput, 'Test Site');

    const submitButton = screen.getByText('Create Site');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Submission failed')).toBeInTheDocument();
    });
  });
});