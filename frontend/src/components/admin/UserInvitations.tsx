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
import { useAuth } from '../../contexts/AuthContext';
import { copyTextToClipboard } from '../../lib/clipboard';

const inviteSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Please enter a valid email address'),
  expires_in_days: z.coerce.number().int().min(1).max(30).default(7),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface Invitation {
  id: number;
  email: string;
  full_name?: string;
  expires_at: string;
  used_at?: string | null;
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
  const { user } = useAuth();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteDialogMode, setInviteDialogMode] = useState<'form' | 'success'>('form');
  const [selectedSites, setSelectedSites] = useState<Record<number, SiteRole>>({});
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [inviteEmailStatus, setInviteEmailStatus] = useState<
    | { email_sent: true }
    | { email_sent: false; email_error?: string }
    | null
  >(null);
  const [isResendDialogOpen, setIsResendDialogOpen] = useState(false);
  const [resendInvitationId, setResendInvitationId] = useState<number | null>(null);
  const [resendExpiresInDays, setResendExpiresInDays] = useState(7);
  const directInviteInputRef = React.useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const canInvite = user?.role === 'GLOBAL_ADMIN' || user?.role === 'ADMIN';

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      expires_in_days: 7,
    },
  });

  const inviteExpiresInDays = watch('expires_in_days');

  // Fetch pending invitations
  const { data: invitationsData, isLoading } = useQuery<{ invitations: Invitation[] }>({
    queryKey: ['admin', 'invitations'],
    queryFn: async (): Promise<{ invitations: Invitation[] }> => {
      // Backend returns { success: true, data: Invitation[] }
      // Normalize to { invitations: Invitation[] } for this component.
      const response = await apiClient.get<Invitation[] | { invitations: Invitation[] }>('/admin/invitations');
      const data = response.data as unknown;
      const invitations = Array.isArray(data)
        ? (data as Invitation[])
        : ((data as { invitations?: Invitation[] } | null | undefined)?.invitations ?? []);
      return { invitations };
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

  const availableSites = sitesData?.sites ?? [];
  const hasAvailableSites = availableSites.length > 0;
  const hasSelectedSites = Object.keys(selectedSites).length > 0;

  // Send invitation mutation
  const sendInviteMutation = useMutation({
    mutationFn: async (data: { full_name: string; email: string; sites: Array<{ site_id: number; site_role: SiteRole }>; expires_in_days: number }) => {
      return apiClient.inviteUser(data.email, data.sites, data.full_name, data.expires_in_days);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      queryClient.refetchQueries({ queryKey: ['admin', 'invitations'] });
      const token = (response.data as any)?.token as string | undefined;
      const inviteUrlFromApi = (response.data as any)?.invite_url as string | undefined;
      const inviteUrl = inviteUrlFromApi || (token ? `${window.location.origin}/auth/register?token=${token}` : null);

      const emailSent = Boolean((response.data as any)?.email_sent);
      const emailError = (response.data as any)?.email_error as string | undefined;
      setInviteEmailStatus(emailSent ? { email_sent: true } : { email_sent: false, email_error: emailError });

      if (inviteUrl) {
        setCreatedInviteUrl(inviteUrl);
      } else {
        setCreatedInviteUrl(null);
      }

      setInviteDialogMode('success');

      toast.success('Invitation created successfully');

      // Best-effort auto-copy; never throw if clipboard API is unavailable
      if (inviteUrl) {
        void (async () => {
          const copied = await copyTextToClipboard(inviteUrl, {
            fallbackInput: directInviteInputRef.current,
          });
          if (copied) {
            toast.info('Invitation link copied to clipboard');
          } else {
            toast.info('Copy manually');
          }
        })();
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send invitation');
    },
  });

  const rotateLinkMutation = useMutation({
    mutationFn: async (invitationId: number) => {
      return apiClient.rotateInvitationLink(invitationId);
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      const inviteUrl = (response.data as any)?.invite_url as string | undefined;
      if (!inviteUrl) {
        toast.error('Failed to generate invite link');
        return;
      }
      const copied = await copyTextToClipboard(inviteUrl);
      if (copied) toast.success('Invitation link copied to clipboard');
      else toast.info('Copy manually');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to generate invite link');
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (payload: { invitationId: number; expires_in_days: number }) => {
      return apiClient.resendInvitation(payload.invitationId, { expires_in_days: payload.expires_in_days });
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      const inviteUrl = (response.data as any)?.invite_url as string | undefined;
      const emailSent = Boolean((response.data as any)?.email_sent);
      const emailError = (response.data as any)?.email_error as string | undefined;

      if (emailSent) toast.success('Invitation resent');
      else if (emailError === 'SMTP not configured') toast.info('Invite link generated (SMTP not configured)');
      else if (emailError) toast.error(`Email not sent: ${emailError}`);
      else toast.error('Email not sent');

      if (inviteUrl) {
        const copied = await copyTextToClipboard(inviteUrl);
        if (copied) toast.info('Invitation link copied to clipboard');
      }

      setIsResendDialogOpen(false);
      setResendInvitationId(null);
      setResendExpiresInDays(7);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to resend invitation');
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

    sendInviteMutation.mutate({
      full_name: data.full_name,
      email: data.email,
      sites,
      expires_in_days: data.expires_in_days,
    });
  };

  const handleCancelInvitation = (invitationId: number) => {
    cancelInviteMutation.mutate(invitationId);
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

  const isUsed = (invitation: Invitation) => {
    return Boolean(invitation.used_at);
  };

  const resetInviteDialogState = () => {
    setInviteDialogMode('form');
    setCreatedInviteUrl(null);
    setInviteEmailStatus(null);
    setSelectedSites({});
    reset();
  };

  const handleInviteDialogOpenChange = (open: boolean) => {
    setIsInviteDialogOpen(open);
    if (!open) {
      resetInviteDialogState();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Invite Button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Pending Invitations</h3>
          <p className="text-sm text-muted-foreground">
            Manage user invitations and send new invites
          </p>
        </div>
        {canInvite && (
          <>
            <Button
              onClick={() => {
                setIsInviteDialogOpen(true);
              }}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </Button>

            <Dialog open={isInviteDialogOpen} onOpenChange={handleInviteDialogOpenChange}>
              <DialogContent onOpenChange={handleInviteDialogOpenChange}>
                {inviteDialogMode === 'success' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Invitation created</DialogTitle>
                      <DialogDescription>
                        Share the direct invite link below.
                      </DialogDescription>
                    </DialogHeader>

                    {createdInviteUrl && (
                      <div className="space-y-2 rounded-md border p-3 bg-muted/20">
                        <Label>Direct invite link</Label>
                        <div className="flex gap-2">
                          <Input
                            ref={directInviteInputRef}
                            readOnly
                            value={createdInviteUrl}
                            onFocus={(e) => e.currentTarget.select()}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={async () => {
                              const copied = await copyTextToClipboard(createdInviteUrl, {
                                fallbackInput: directInviteInputRef.current,
                              });
                              if (copied) toast.success('Invitation link copied to clipboard');
                              else toast.info('Copy manually');
                            }}
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy invite link
                          </Button>
                        </div>

                        {inviteEmailStatus && (
                          <p className="text-sm text-muted-foreground">
                            {inviteEmailStatus.email_sent
                              ? 'Email sent.'
                              : inviteEmailStatus.email_error === 'SMTP not configured'
                                ? 'Email not sent (SMTP not configured).'
                                : inviteEmailStatus.email_error
                                  ? `Email not sent: ${inviteEmailStatus.email_error}`
                                  : 'Email not sent.'}
                          </p>
                        )}
                      </div>
                    )}

                    <DialogFooter>
                      <Button type="button" onClick={() => handleInviteDialogOpenChange(false)}>
                        Done
                      </Button>
                    </DialogFooter>
                  </>
                ) : (
                  <>
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
                          {hasAvailableSites ? (
                            availableSites.map((site: Site) => (
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
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">No sites available</p>
                              <p className="text-xs text-muted-foreground">Create a site first before inviting users.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Invite expires in</Label>
                        <input type="hidden" {...register('expires_in_days')} />
                        <Select
                          value={String(inviteExpiresInDays ?? 7)}
                          onValueChange={(value) =>
                            setValue('expires_in_days', Number(value), { shouldDirty: true, shouldValidate: true })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="7 days" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                              <SelectItem key={d} value={String(d)}>
                                {d} day{d === 1 ? '' : 's'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.expires_in_days && (
                          <p className="text-sm text-red-600">{String(errors.expires_in_days.message)}</p>
                        )}
                      </div>

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleInviteDialogOpenChange(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !hasAvailableSites || !hasSelectedSites}>
                          {isSubmitting ? 'Sending...' : 'Send Invitation'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      <Dialog open={isResendDialogOpen} onOpenChange={setIsResendDialogOpen}>
        <DialogContent onOpenChange={setIsResendDialogOpen}>
          <DialogHeader>
            <DialogTitle>Resend invitation</DialogTitle>
            <DialogDescription>
              This rotates the token and sends a new email (if SMTP is configured).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>New expiry</Label>
            <Select value={String(resendExpiresInDays)} onValueChange={(v) => setResendExpiresInDays(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} day{d === 1 ? '' : 's'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsResendDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!resendInvitationId || resendInviteMutation.isPending}
              onClick={() => {
                if (!resendInvitationId) return;
                resendInviteMutation.mutate({ invitationId: resendInvitationId, expires_in_days: resendExpiresInDays });
              }}
            >
              {resendInviteMutation.isPending ? 'Sending...' : 'Resend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    <UserPlus className="w-8 h-8 text-muted-foreground" />
                    <p className="text-muted-foreground">No pending invitations</p>
                    <p className="text-sm text-muted-foreground">Click "Invite User" above to send your first invitation</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              invitationsData.invitations.map((invitation: Invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>
                    <span className="font-medium">{invitation.full_name || 'N/A'}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{invitation.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {invitation.sites?.length ? (
                        invitation.sites.map((site: Invitation['sites'][number]) => (
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
                    <span className="text-sm text-muted-foreground">
                      {invitation.invited_by_name}
                    </span>
                  </TableCell>
                  <TableCell>
                    {isUsed(invitation) ? (
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        <CheckCircle className="w-3 h-3" />
                        Used
                      </Badge>
                    ) : isExpired(invitation.expires_at) ? (
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
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(invitation.expires_at), { addSuffix: true })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {!isUsed(invitation) && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={rotateLinkMutation.isPending}
                            onClick={() => rotateLinkMutation.mutate(invitation.id)}
                            title="Copy invite link"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResendInvitationId(invitation.id);
                              setResendExpiresInDays(7);
                              setIsResendDialogOpen(true);
                            }}
                            title="Resend invite"
                          >
                            <Mail className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600"
                            disabled={cancelInviteMutation.isPending || isUsed(invitation)}
                          >
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