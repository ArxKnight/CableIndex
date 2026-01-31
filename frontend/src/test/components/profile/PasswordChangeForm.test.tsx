import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordChangeForm from '../../../components/profile/PasswordChangeForm';
import apiClient from '../../../lib/api';

// Mock the API client
vi.mock('../../../lib/api', () => ({
  default: {
    changePassword: vi.fn(),
  },
}));

const mockProps = {
  onSuccess: vi.fn(),
};

describe('PasswordChangeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render password change form', () => {
    render(<PasswordChangeForm {...mockProps} />);

    expect(screen.getByRole('heading', { name: /^change password$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm new password$/i)).toBeInTheDocument();
  });

  it('should validate required current password', async () => {
    const user = userEvent.setup();
    render(<PasswordChangeForm {...mockProps} />);

    const submitButton = screen.getByRole('button', { name: /^change password$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Current password is required')).toBeInTheDocument();
    });

    expect(apiClient.changePassword).not.toHaveBeenCalled();
  });

  it('should validate new password length', async () => {
    const user = userEvent.setup();
    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const newPasswordInput = screen.getByLabelText(/^new password$/i);

    await user.type(currentPasswordInput, 'currentpass');
    await user.type(newPasswordInput, 'short');

    const submitButton = screen.getByRole('button', { name: /^change password$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('New password must be at least 8 characters')).toBeInTheDocument();
    });
  });

  it('should validate password confirmation match', async () => {
    const user = userEvent.setup();
    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const newPasswordInput = screen.getByLabelText(/^new password$/i);
    const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i);

    await user.type(currentPasswordInput, 'currentpass');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'differentpassword');

    const submitButton = screen.getByRole('button', { name: /^change password$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    });
  });

  it('should submit valid password change', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.changePassword).mockResolvedValue({
      success: true,
    });

    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const newPasswordInput = screen.getByLabelText(/^new password$/i);
    const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i);

    await user.type(currentPasswordInput, 'currentpass');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');

    const submitButton = screen.getByRole('button', { name: /^change password$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(apiClient.changePassword).toHaveBeenCalledWith({
        current_password: 'currentpass',
        new_password: 'newpassword123',
      });
    });
  });

  it('should show success message on successful password change', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.changePassword).mockResolvedValue({
      success: true,
    });

    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const newPasswordInput = screen.getByLabelText(/^new password$/i);
    const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i);

    await user.type(currentPasswordInput, 'currentpass');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');

    const submitButton = screen.getByRole('button', { name: /^change password$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Password changed successfully')).toBeInTheDocument();
    });

    expect(mockProps.onSuccess).toHaveBeenCalled();
  });

  it('should show error message on API failure', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.changePassword).mockResolvedValue({
      success: false,
      error: 'Current password is incorrect',
    });

    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const newPasswordInput = screen.getByLabelText(/^new password$/i);
    const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i);

    await user.type(currentPasswordInput, 'wrongpass');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');

    const submitButton = screen.getByRole('button', { name: /^change password$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
    });
  });

  it('should handle network errors', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.changePassword).mockRejectedValue(new Error('Network error'));

    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const newPasswordInput = screen.getByLabelText(/^new password$/i);
    const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i);

    await user.type(currentPasswordInput, 'currentpass');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');

    const submitButton = screen.getByRole('button', { name: /^change password$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should clear form on successful password change', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.changePassword).mockResolvedValue({
      success: true,
    });

    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const newPasswordInput = screen.getByLabelText(/^new password$/i);
    const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i);

    await user.type(currentPasswordInput, 'currentpass');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');

    const submitButton = screen.getByRole('button', { name: /^change password$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Password changed successfully')).toBeInTheDocument();
    });

    // Form should be cleared
    expect(currentPasswordInput).toHaveValue('');
    expect(newPasswordInput).toHaveValue('');
    expect(confirmPasswordInput).toHaveValue('');
  });

  it('should reset form when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const newPasswordInput = screen.getByLabelText(/^new password$/i);

    await user.type(currentPasswordInput, 'somepassword');
    await user.type(newPasswordInput, 'newpassword');

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(currentPasswordInput).toHaveValue('');
    expect(newPasswordInput).toHaveValue('');
  });

  it('should toggle password visibility', async () => {
    const user = userEvent.setup();
    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const toggleButton = currentPasswordInput.parentElement?.querySelector('button');

    expect(currentPasswordInput).toHaveAttribute('type', 'password');

    if (toggleButton) {
      await user.click(toggleButton);
      expect(currentPasswordInput).toHaveAttribute('type', 'text');

      await user.click(toggleButton);
      expect(currentPasswordInput).toHaveAttribute('type', 'password');
    }
  });

  it('should disable form during submission', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.changePassword).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<PasswordChangeForm {...mockProps} />);

    const currentPasswordInput = screen.getByLabelText(/current password/i);
    const newPasswordInput = screen.getByLabelText(/^new password$/i);
    const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i);

    await user.type(currentPasswordInput, 'currentpass');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');

    const submitButton = screen.getByRole('button', { name: /^change password$/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(currentPasswordInput).toBeDisabled();
      expect(newPasswordInput).toBeDisabled();
      expect(confirmPasswordInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });
});