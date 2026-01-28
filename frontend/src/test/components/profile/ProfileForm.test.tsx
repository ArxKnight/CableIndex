import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileForm from '../../../components/profile/ProfileForm';
import { apiClient } from '../../../lib/api';

// Mock the API client
vi.mock('../../../lib/api', () => ({
  default: {
    updateProfile: vi.fn(),
  },
  apiClient: {
    updateProfile: vi.fn(),
  },
}));

// Mock the auth context
const mockUpdateUser = vi.fn();
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    updateUser: mockUpdateUser,
  }),
}));

const mockUser = {
  id: 1,
  email: 'test@example.com',
  full_name: 'John Doe',
  role: 'USER' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockProps = {
  user: mockUser,
  onSuccess: vi.fn(),
};

describe('ProfileForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render form with user data pre-filled', () => {
    render(<ProfileForm {...mockProps} />);

    expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Edit Profile')).toBeInTheDocument();
  });

  it('should validate required full name field', async () => {
    const user = userEvent.setup();
    render(<ProfileForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);

    const submitButton = screen.getByText('Save Changes');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Full name must be at least 2 characters')).toBeInTheDocument();
    });

    expect(vi.mocked(apiClient.updateProfile)).not.toHaveBeenCalled();
  });

  it('should validate email format', async () => {
    const user = userEvent.setup();
    render(<ProfileForm {...mockProps} />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.clear(emailInput);
    await user.type(emailInput, 'invalid-email');

    const submitButton = screen.getByText('Save Changes');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument();
    });
  });

  it('should submit only changed fields', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.updateProfile).mockResolvedValue({
      success: true,
      data: { user: { ...mockUser, full_name: 'Jane Doe' } },
    });

    render(<ProfileForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    const submitButton = screen.getByText('Save Changes');
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.updateProfile).toHaveBeenCalledWith({
        full_name: 'Jane Doe',
      });
    });
  });

  it('should submit both email and name when both changed', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.updateProfile).mockResolvedValue({
      success: true,
      data: { user: { ...mockUser, full_name: 'Jane Doe', email: 'jane@example.com' } },
    });

    render(<ProfileForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);

    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');
    await user.clear(emailInput);
    await user.type(emailInput, 'jane@example.com');

    const submitButton = screen.getByText('Save Changes');
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.updateProfile).toHaveBeenCalledWith({
        full_name: 'Jane Doe',
        email: 'jane@example.com',
      });
    });
  });

  it('should show success message on successful update', async () => {
    const user = userEvent.setup();
    const updatedUser = { ...mockUser, full_name: 'Jane Doe' };
    vi.mocked(apiClient.updateProfile).mockResolvedValue({
      success: true,
      data: { user: updatedUser },
    });

    render(<ProfileForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    const submitButton = screen.getByText('Save Changes');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Profile updated successfully')).toBeInTheDocument();
    });

    expect(mockUpdateUser).toHaveBeenCalledWith(updatedUser);
    expect(mockProps.onSuccess).toHaveBeenCalledWith(updatedUser);
  });

  it('should show error message on API failure', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.updateProfile).mockResolvedValue({
      success: false,
      error: 'Email already exists',
    });

    render(<ProfileForm {...mockProps} />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.clear(emailInput);
    await user.type(emailInput, 'existing@example.com');

    const submitButton = screen.getByText('Save Changes');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email already exists')).toBeInTheDocument();
    });
  });

  it('should handle network errors', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.updateProfile).mockRejectedValue(new Error('Network error'));

    render(<ProfileForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    const submitButton = screen.getByText('Save Changes');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should show no changes message when no fields changed', async () => {
    const user = userEvent.setup();
    render(<ProfileForm {...mockProps} />);

    const submitButton = screen.getByText('Save Changes');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('No changes to save')).toBeInTheDocument();
    });

    expect(apiClient.updateProfile).not.toHaveBeenCalled();
  });

  it('should reset form when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<ProfileForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Changed Name');

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
  });

  it('should disable form during submission', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.updateProfile).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<ProfileForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    const submitButton = screen.getByText('Save Changes');
    await user.click(submitButton);

    await waitFor(() => {
      expect(nameInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });

  it('should disable save button when no changes made', () => {
    render(<ProfileForm {...mockProps} />);

    const submitButton = screen.getByText('Save Changes');
    expect(submitButton).toBeDisabled();
  });

  it('should enable save button when changes are made', async () => {
    const user = userEvent.setup();
    render(<ProfileForm {...mockProps} />);

    const nameInput = screen.getByLabelText(/full name/i);
    await user.type(nameInput, ' Updated');

    const submitButton = screen.getByText('Save Changes');
    expect(submitButton).toBeEnabled();
  });
});