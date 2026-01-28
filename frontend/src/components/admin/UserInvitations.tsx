import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  UserPlus,
  Mail,
  Trash2,
  Copy,
  Clock,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';
import { Site, SiteRole } from '../../types';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';

const inviteSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Please enter a valid email address'),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface Invitation {
  id: number;
  email: string;
  full_name?: string;
  expires_at: string;
  created_at: string;
  invited_by_name: string;
  sites: Array<{
    site_id: number;
    site_role: SiteRole;
    site_name?: string;
    site_code?: string;
  }>;
  token?: string;
}

const UserInvitations: React.FC = () => {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [selectedSites, setSelectedSites] = useState<Record<number, SiteRole>>({});
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
  });

  // Fetch pending invitations
  const { data: invitationsData, isLoading } = useQuery({
    queryKey: ['admin', 'invitations'],
    queryFn: async () => {
      const response = await apiClient.get<{ invitations: Invitation[] }>('/admin/invitations');
      return response.data;
    },
  });

  // Fetch available sites
  const { data: sitesData } = useQuery({
    queryKey: ['sites', 'invite'],
    queryFn: async () => {
      const response = await apiClient.getSites({ limit: 1000 });
      return response.data;
    },
  });

  // Send invitation mutation
  const sendInviteMutation = useMutation({
    mutationFn: async (data: { full_name: string; email: string; sites: Array<{ site_id: number; site_role: SiteRole }> }) => {
      return apiClient.inviteUser(data.email, data.sites, data.full_name);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      toast.success('Invitation sent successfully');
      reset();
      setSelectedSites({});
      setIsInviteDialogOpen(false);

      // Show invitation link if available
      if (response.data && typeof response.data === 'object' && 'token' in response.data) {
        const inviteUrl = `${window.location.origin}/auth/register?token=${(response.data as any).token}`;
        navigator.clipboard.writeText(inviteUrl);
        toast.info('Invitation link copied to clipboard');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send invitation');
    },
  });

  // Cancel invitation mutation
  const cancelInviteMutation = useMutation({
    mutationFn: async (invitationId: number) => {
      return apiClient.delete(`/admin/invitations/${invitationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      toast.success('Invitation cancelled successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to cancel invitation');
    },
  });

  const onSubmit = (data: InviteFormData) => {
    const sites = Object.entries(selectedSites).map(([siteId, siteRole]) => ({
      site_id: Number(siteId),
      site_role: siteRole,
    }));

    if (sites.length === 0) {
      toast.error('Select at least one site');
      return;
    }

    sendInviteMutation.mutate({ full_name: data.full_name, email: data.email, sites });
  };

  const handleCancelInvitation = (invitationId: number) => {
    cancelInviteMutation.mutate(invitationId);
  };

  const copyInviteLink = (token: string) => {
    const inviteUrl = `${window.location.origin}/auth/register?token=${token}`;
    navigator.clipboard.writeText(inviteUrl);
    toast.success('Invitation link copied to clipboard');
  };

  const getRoleBadgeVariant = (role: SiteRole) => {
    switch (role) {
      case 'ADMIN':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Header with Invite Button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Pending Invitations</h3>
          <p className="text-sm text-gray-600">
            Manage user invitations and send new invites
          </p>
        </div>
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite New User</DialogTitle>
              <DialogDescription>
                Send an invitation to a new user to join the system. They will receive an email with a link to set their password.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  type="text"
                  placeholder="John Doe"
                  {...register('full_name')}
                />
                {errors.full_name && (
                  <p className="text-sm text-red-600">{errors.full_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Sites</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {sitesData?.sites?.length ? (
                    sitesData.sites.map((site: Site) => (
                      <div key={site.id} className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedSites[site.id])}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSelectedSites((prev) => {
                                if (!checked) {
                                  const updated = { ...prev };
                                  delete updated[site.id];
                                  return updated;
                                }
                                return { ...prev, [site.id]: 'USER' };
                              });
                            }}
                          />
                          <span>{site.name} ({site.code})</span>
                        </label>
                        {selectedSites[site.id] && (
                          <Select
                            value={selectedSites[site.id]}
                            onValueChange={(value) =>
                              setSelectedSites((prev) => ({
                                ...prev,
                                [site.id]: value as SiteRole,
                              }))
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USER">User</SelectItem>
                              <SelectItem value="ADMIN">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No sites available</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInviteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Sending...' : 'Send Invitation'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Invitations Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead>Invited By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Loading invitations...
                </TableCell>
              </TableRow>
            ) : !invitationsData?.invitations?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <UserPlus className="w-8 h-8 text-gray-400" />
                    <p className="text-gray-600">No pending invitations</p>
                    <p className="text-sm text-gray-500">Click "Invite User" above to send your first invitation</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              invitationsData.invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>
                    <span className="font-medium">{invitation.full_name || 'N/A'}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-sm">{invitation.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {invitation.sites?.length ? (
                        invitation.sites.map((site) => (
                          <Badge key={`${invitation.id}-${site.site_id}`} variant={getRoleBadgeVariant(site.site_role)}>
                            {site.site_code || site.site_name} ({site.site_role})
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">No sites</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {invitation.invited_by_name}
                    </span>
                  </TableCell>
                  <TableCell>
                    {isExpired(invitation.expires_at) ? (
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                        <Clock className="w-3 h-3" />
                        Expired
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                        <CheckCircle className="w-3 h-3" />
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {formatDistanceToNow(new Date(invitation.expires_at), { addSuffix: true })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {invitation.token && !isExpired(invitation.expires_at) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyInviteLink(invitation.token!)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to cancel the invitation for {invitation.email}?
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleCancelInvitation(invitation.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Cancel Invitation
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default UserInvitations;