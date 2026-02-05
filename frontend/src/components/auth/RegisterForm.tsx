import React from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onSwitchToLogin }) => {
  // Public registration is intentionally disabled.
  // Accounts are created via admin invitations only.
  void onSuccess;

  return (
    <div className="w-full max-w-md mx-auto">
      <Alert>
        <AlertDescription>
          Public registration is disabled. Please use an invitation link from an admin.
        </AlertDescription>
      </Alert>

      {onSwitchToLogin && (
        <div className="pt-4">
          <Button type="button" variant="outline" className="w-full" onClick={onSwitchToLogin}>
            Back to sign in
          </Button>
        </div>
      )}
    </div>
  );
};

export default RegisterForm;
