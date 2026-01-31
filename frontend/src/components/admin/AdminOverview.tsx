import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { apiClient } from '../../lib/api';
import { Mail, UserMinus, Users, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type AdminOverviewData = {
  pending_invites_count: number;
  expired_invites_count: number;
  users_without_sites_count: number;
  smtp_configured: boolean;
};

interface AdminOverviewProps {
  onNavigate?: (tab: 'overview' | 'users' | 'invitations' | 'settings') => void;
}

const AdminOverview: React.FC<AdminOverviewProps> = ({ onNavigate }) => {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const response = await apiClient.get<{ overview: AdminOverviewData }>('/admin/overview');
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to load admin overview');
      }
      return response.data.overview;
    },
  });

  const role = String(user?.role || '').toUpperCase();
  const isGlobalAdmin = role === 'GLOBAL_ADMIN';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading overview…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to load admin overview'}
        </AlertDescription>
      </Alert>
    );
  }

  const overview = data || {
    pending_invites_count: 0,
    expired_invites_count: 0,
    users_without_sites_count: 0,
    smtp_configured: false,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Overview</h2>
        <p className="text-muted-foreground">
          Admin notifications and actions requiring attention.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              Unused invites that have not expired.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-3xl font-bold">{overview.pending_invites_count}</div>
            <Button variant="outline" onClick={() => onNavigate?.('invitations')}>
              View
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Expired Invitations
            </CardTitle>
            <CardDescription>
              Unused invites that require re-sending.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-3xl font-bold">{overview.expired_invites_count}</div>
            <Button variant="outline" onClick={() => onNavigate?.('invitations')}>
              Manage
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5" />
              Users Without Site Access
            </CardTitle>
            <CardDescription>
              Users who have zero site memberships.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-3xl font-bold">{overview.users_without_sites_count}</div>
            <Button variant="outline" onClick={() => onNavigate?.('users')}>
              Review
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Email Configuration
            </CardTitle>
            <CardDescription>
              Invitation emails are optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.smtp_configured ? (
              <div className="text-sm">
                <span className="font-medium">SMTP is configured.</span>
                <div className="text-muted-foreground">Invites can be emailed automatically.</div>
              </div>
            ) : (
              <div className="text-sm">
                <span className="font-medium">Email not configured.</span>
                <div className="text-muted-foreground">
                  Invites will still generate links, but email sending is skipped.
                </div>
              </div>
            )}

            {!overview.smtp_configured && (
              <div className="flex gap-2">
                {isGlobalAdmin ? (
                  <Button variant="outline" onClick={() => onNavigate?.('settings')}>
                    Configure SMTP
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Contact a Global Admin
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminOverview;
