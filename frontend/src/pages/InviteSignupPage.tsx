import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2 } from 'lucide-react';

const inviteSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/\d/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type InviteFormData = z.infer<typeof inviteSchema>;

const InviteSignupPage: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [inviteData, setInviteData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
  });

  useEffect(() => {
    const validate = async () => {
      if (!token) return;
      try {
        setIsLoading(true);
        const response = await apiClient.validateInvite(token);
        if (response.success) {
          setInviteData(response.data);
        } else {
          setError(response.error || 'Invalid invitation');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to validate invitation');
      } finally {
        setIsLoading(false);
      }
    };

    validate();
  }, [token]);

  const onSubmit = async (data: InviteFormData) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.acceptInvite({
        token,
        full_name: data.full_name,
        password: data.password,
      });

      if (!response.success) {
        setError(response.error || 'Failed to accept invitation');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const invitedSites = useMemo(() => inviteData?.sites || [], [inviteData]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold">Complete Your Invitation</h1>
            <p className="text-muted-foreground mt-2">
              Set your password to activate your account
            </p>
          </div>

          {!token && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>Invitation token is missing.</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {inviteData && (
            <div className="mb-4 text-sm text-muted-foreground space-y-2">
              <div>Email: <span className="font-medium text-foreground">{inviteData.email}</span></div>
              {invitedSites.length > 0 && (
                <div>
                  Sites:
                  <ul className="list-disc list-inside">
                    {invitedSites.map((site: any) => (
                      <li key={site.site_id}>
                        {site.site_name} ({site.site_code}) - {site.site_role}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                type="text"
                placeholder="Enter your full name"
                {...register('full_name')}
                disabled={isLoading || !inviteData}
              />
              {errors.full_name && (
                <p className="text-sm text-destructive">{errors.full_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a password"
                {...register('password')}
                disabled={isLoading || !inviteData}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                {...register('confirmPassword')}
                disabled={isLoading || !inviteData}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading || !inviteData}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Complete Signup'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default InviteSignupPage;
