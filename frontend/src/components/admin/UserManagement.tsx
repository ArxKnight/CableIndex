import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';

import { apiClient } from '../../lib/api';
import { copyTextToClipboard } from '../../lib/clipboard';
import { useAuth } from '../../contexts/AuthContext';
import { SiteMembership, User, UserRole, SiteRole } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';

interface UserWithStats extends User {
  label_count: number;
  site_count: number;
  last_activity?: string;
  last_activity_summary?: string;
  last_activity_at?: string;
}

type UserSortKey = 'user' | 'role' | 'activity' | 'labels' | 'sites' | 'joined';
type SortDirection = 'asc' | 'desc';

const UserManagement: React.FC = () => {
  const { user: currentUser, memberships } = useAuth();
  const { isGlobalAdmin } = usePermissions();

  const adminSites: SiteMembership[] = (memberships ?? []).filter((m) => m.site_role === 'SITE_ADMIN');

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [siteSelections, setSiteSelections] = useState<Record<number, SiteRole>>({});
  const [identityDraft, setIdentityDraft] = useState<{ username: string; email: string }>({ username: '', email: '' });
  const [passwordResetLink, setPasswordResetLink] = useState<string>('');
  const [passwordResetEmailStatus, setPasswordResetEmailStatus] = useState<{ email_sent: boolean; email_error?: string } | null>(null);
  const passwordResetLinkInputRef = useRef<HTMLInputElement | null>(null);
  const [sortState, setSortState] = useState<{ key: UserSortKey; direction: SortDirection } | null>(null);
  const queryClient = useQueryClient();

  const toggleSort = useCallback((key: UserSortKey) => {
    setSortState((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }

      const defaultDirection: SortDirection =
        key === 'user' || key === 'role'
          ? 'asc'
          : 'desc';

      return { key, direction: defaultDirection };
    });
  }, []);

  const sortIndicator = useCallback((key: UserSortKey) => {
    if (!sortState || sortState.key !== key) return null;
    return (
      <span className="ml-1 text-xs text-muted-foreground">
        {sortState.direction === 'asc' ? '↑' : '↓'}
      </span>
    );
  }, [sortState]);

  const resetDialogState = () => {
    setSelectedUser(null);
    setSiteSelections({});
    setIdentityDraft({ username: '', email: '' });
    setPasswordResetLink('');
    setPasswordResetEmailStatus(null);
  };

  const handleDetailsOpenChange = (open: boolean) => {
    setDetailsOpen(open);
    if (!open) resetDialogState();
  };

  const { data: usersData, isLoading, error } = useQuery({
    queryKey: ['admin', 'users', searchTerm, roleFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (roleFilter !== 'all') params.append('role', roleFilter);

      const response = await apiClient.get<{ users: UserWithStats[] }>(
        `/admin/users?${params.toString()}`
      );
      return response.data;
    },
  });

  const users = useMemo(() => (usersData?.users ?? []), [usersData?.users]);

  const sortedUsers = useMemo(() => {
    if (!sortState) return users;

    const getActivityMs = (user: UserWithStats): number | null => {
      const v = user.last_activity_at ?? user.last_activity;
      if (!v) return null;
      const ms = new Date(v).getTime();
      if (Number.isNaN(ms)) return null;
      return ms;
    };

    const directionMultiplier = sortState.direction === 'asc' ? 1 : -1;
    const list = [...users];

    list.sort((a, b) => {
      switch (sortState.key) {
        case 'user': {
          const aName = String(a.username ?? a.email ?? '').trim();
          const bName = String(b.username ?? b.email ?? '').trim();
          return directionMultiplier * aName.localeCompare(bName, undefined, { sensitivity: 'base' });
        }
        case 'role': {
          const aRole = String(a.role ?? '').trim();
          const bRole = String(b.role ?? '').trim();
          return directionMultiplier * aRole.localeCompare(bRole, undefined, { sensitivity: 'base' });
        }
        case 'activity': {
          const aMs = getActivityMs(a);
          const bMs = getActivityMs(b);

          // Keep "Never" at the bottom regardless of direction.
          if (aMs === null && bMs === null) return 0;
          if (aMs === null) return 1;
          if (bMs === null) return -1;

          return directionMultiplier * (aMs - bMs);
        }
        case 'labels': {
          const aCount = Number(a.label_count ?? 0);
          const bCount = Number(b.label_count ?? 0);
          return directionMultiplier * (aCount - bCount);
        }
        case 'sites': {
          const aCount = Number(a.site_count ?? 0);
          const bCount = Number(b.site_count ?? 0);
          return directionMultiplier * (aCount - bCount);
        }
        case 'joined': {
          const aMs = new Date(a.created_at).getTime();
          const bMs = new Date(b.created_at).getTime();
          const safeAMs = Number.isNaN(aMs) ? 0 : aMs;
          const safeBMs = Number.isNaN(bMs) ? 0 : bMs;
          return directionMultiplier * (safeAMs - safeBMs);
        }
        default:
          return 0;
      }
    });

    return list;
  }, [sortState, users]);

  const { data: sitesData } = useQuery({
    queryKey: ['admin', 'sites'],
    queryFn: async () => {
      const response = await apiClient.getSites({ limit: 1000 });
      return response.data;
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: UserRole }) => {
      return apiClient.updateUserRole(userId, role);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSelectedUser((prev) =>
        prev && prev.id === variables.userId ? { ...prev, role: variables.role } : prev
      );
      toast.success('User role updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update user role');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (params: { userId: number; cascade?: boolean }) =>
      apiClient.delete(`/admin/users/${params.userId}${params.cascade ? '?cascade=true' : ''}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User deleted successfully');
      handleDetailsOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete user');
    },
  });

  const updateUserIdentityMutation = useMutation({
    mutationFn: async (data: { userId: number; username?: string; email?: string }) =>
      apiClient.put(`/admin/users/${data.userId}`, {
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSelectedUser((prev) => {
        if (!prev || prev.id !== variables.userId) return prev;
        return {
          ...prev,
          ...(variables.username !== undefined ? { username: variables.username } : {}),
          ...(variables.email !== undefined ? { email: variables.email } : {}),
        };
      });
      toast.success('User updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update user');
    },
  });

  const passwordResetMutation = useMutation({
    mutationFn: async (params: { userId: number }) =>
      apiClient.post<{ reset_url: string; email_sent: boolean; email_error?: string; expires_at: string }>(
        `/admin/users/${params.userId}/password-reset`,
        {}
      ),
    onSuccess: (response) => {
      const resetUrl = String((response as any)?.data?.reset_url || '');
      const email_sent = Boolean((response as any)?.data?.email_sent);
      const email_error = (response as any)?.data?.email_error ? String((response as any).data.email_error) : undefined;

      setPasswordResetLink(resetUrl);
      setPasswordResetEmailStatus({ email_sent, ...(email_error ? { email_error } : {}) });

      if (email_sent) {
        toast.success('Password reset email sent');
      } else if (email_error === 'SMTP not configured') {
        toast.error('SMTP not configured — reset link created');
      } else {
        toast.error('Email failed — reset link created');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create password reset link');
    },
  });

  const updateUserSitesMutation = useMutation({
    mutationFn: async (data: {
      userId: number;
      sites: Array<{ site_id: number; site_role: SiteRole }>;
    }) => apiClient.updateUserSites(data.userId, data.sites),
    onSuccess: () => {
      toast.success('User site access updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      handleDetailsOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update site access');
    },
  });

  const handleRoleChange = (userId: number, newRole: UserRole) => {
    updateUserRoleMutation.mutate({ userId, role: newRole });
  };

  const handleDeleteUser = (userId: number, options?: { cascade?: boolean }) => {
    deleteUserMutation.mutate({ userId, cascade: options?.cascade });
  };

  const openUserDetails = async (user: UserWithStats) => {
    resetDialogState();
    setSelectedUser(user);
    setIdentityDraft({ username: user.username || '', email: user.email || '' });
    handleDetailsOpenChange(true);

    try {
      const response = await apiClient.getUserSites(user.id);
      if (response.success && response.data?.sites) {
        const selections: Record<number, SiteRole> = {};
        response.data.sites.forEach((site: any) => {
          selections[site.site_id] = site.site_role;
        });
        setSiteSelections(selections);
      }
    } catch {
      // Ignore; show empty selections
    }
  };

  const handleSaveAll = async () => {
    if (!selectedUser) return;
    if (cannotEditSelectedUser) return;

    const nextUsername = identityDraft.username.trim();
    const nextEmail = identityDraft.email.trim();

    const identityPatch: { userId: number; username?: string; email?: string } = { userId: selectedUser.id };
    if (isGlobalAdmin) {
      if (nextUsername && nextUsername !== selectedUser.username) identityPatch.username = nextUsername;
      if (nextEmail && nextEmail !== selectedUser.email) identityPatch.email = nextEmail;
    }

    const sites = Object.entries(siteSelections).map(([siteId, siteRole]) => ({
      site_id: Number(siteId),
      site_role: siteRole,
    }));

    try {
      if (identityPatch.username !== undefined || identityPatch.email !== undefined) {
        await updateUserIdentityMutation.mutateAsync(identityPatch);
      }
      await updateUserSitesMutation.mutateAsync({ userId: selectedUser.id, sites });
    } catch {
      // Mutations already toast; keep dialog open
    }
  };

  const cannotEditSelectedUser = !!selectedUser && !isGlobalAdmin && (selectedUser.role === 'GLOBAL_ADMIN' || selectedUser.id === currentUser?.id);

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'GLOBAL_ADMIN':
        return <ShieldCheck className="w-4 h-4" />;
      default:
        return <UserIcon className="w-4 h-4" />;
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'GLOBAL_ADMIN':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load users: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search users by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as UserRole | 'all')}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="GLOBAL_ADMIN">Global Admin</SelectItem>
            <SelectItem value="USER">User</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => toggleSort('user')}>
                  User{sortIndicator('user')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => toggleSort('role')}>
                  Role{sortIndicator('role')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => toggleSort('activity')}>
                  Activity{sortIndicator('activity')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => toggleSort('labels')}>
                  Labels{sortIndicator('labels')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => toggleSort('sites')}>
                  Sites{sortIndicator('sites')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => toggleSort('joined')}>
                  Joined{sortIndicator('joined')}
                </Button>
              </TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : !usersData?.users?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              sortedUsers.map((user) => (
                <TableRow
                  key={user.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => openUserDetails(user)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openUserDetails(user);
                    }
                  }}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.username}</span>
                      <span className="text-sm text-muted-foreground">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)} className="flex items-center gap-1 w-fit">
                      {getRoleIcon(user.role)}
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.last_activity_summary ? (
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          {user.last_activity_summary}
                        </span>
                        {(user.last_activity_at || user.last_activity) && (
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(user.last_activity_at ?? user.last_activity!), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    ) : user.last_activity ? (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(user.last_activity), { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{user.label_count}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{user.site_count}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${user.username}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openUserDetails(user);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detailsOpen} onOpenChange={handleDetailsOpenChange}>
        <DialogContent onOpenChange={handleDetailsOpenChange}>
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>

          {selectedUser ? (
            <div className="space-y-4">
              <div>
                {isGlobalAdmin ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium">Username</div>
                      <Input
                        value={identityDraft.username}
                        onChange={(e) => setIdentityDraft((prev) => ({ ...prev, username: e.target.value }))}
                        disabled={cannotEditSelectedUser || updateUserIdentityMutation.isPending}
                      />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Email</div>
                      <Input
                        value={identityDraft.email}
                        onChange={(e) => setIdentityDraft((prev) => ({ ...prev, email: e.target.value }))}
                        disabled={cannotEditSelectedUser || updateUserIdentityMutation.isPending}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="font-medium">{selectedUser.username}</div>
                    <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant={getRoleBadgeVariant(selectedUser.role)}
                  className="flex items-center gap-1 w-fit"
                >
                  {getRoleIcon(selectedUser.role)}
                  {selectedUser.role}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedUser.site_count} site{selectedUser.site_count === 1 ? '' : 's'} · {selectedUser.label_count} label{selectedUser.label_count === 1 ? '' : 's'}
                </span>
              </div>

              {isGlobalAdmin ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Global Role</div>
                  <Select
                    value={selectedUser.role}
                    onValueChange={(value) => handleRoleChange(selectedUser.id, value as UserRole)}
                    disabled={updateUserRoleMutation.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">User</SelectItem>
                      <SelectItem value="GLOBAL_ADMIN">Global Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Global roles can only be changed by a Global Admin.
                </div>
              )}

              <div className="space-y-2">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Site Access
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3">
                  {(isGlobalAdmin ? (sitesData as any)?.sites : adminSites)?.length ? (
                    (isGlobalAdmin ? (sitesData as any).sites : adminSites).map((site: any) => {
                      const siteId = isGlobalAdmin ? site.id : site.site_id;
                      const siteName = isGlobalAdmin ? site.name : site.site_name;
                      const siteCode = isGlobalAdmin ? site.code : site.site_code;
                      return (
                      <div key={siteId} className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(siteSelections[siteId])}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSiteSelections((prev) => {
                                if (!checked) {
                                  const updated = { ...prev };
                                  delete updated[siteId];
                                  return updated;
                                }
                                return { ...prev, [siteId]: 'SITE_USER' };
                              });
                            }}
                            disabled={cannotEditSelectedUser}
                          />
                          <span>
                            {siteName} ({siteCode})
                          </span>
                        </label>
                        {siteSelections[siteId] && (
                          <Select
                            value={siteSelections[siteId]}
                            onValueChange={(value) =>
                              setSiteSelections((prev) => ({
                                ...prev,
                                [siteId]: value as SiteRole,
                              }))
                            }
                            disabled={cannotEditSelectedUser}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SITE_USER">User</SelectItem>
                              <SelectItem value="SITE_ADMIN">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No sites available</p>
                  )}
                </div>
              </div>

              {isGlobalAdmin && selectedUser.id !== currentUser?.id && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Password Reset</div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => passwordResetMutation.mutate({ userId: selectedUser.id })}
                    disabled={passwordResetMutation.isPending}
                  >
                    {passwordResetMutation.isPending ? 'Creating link...' : 'Send Password Reset'}
                  </Button>

                  {passwordResetLink ? (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        {passwordResetEmailStatus?.email_sent
                          ? 'Email sent. You can also share the link directly.'
                          : passwordResetEmailStatus?.email_error
                            ? `Email not sent: ${passwordResetEmailStatus.email_error}. Share the link directly.`
                            : 'Share the link directly.'}
                      </div>
                      <div className="flex gap-2">
                        <Input ref={passwordResetLinkInputRef} value={passwordResetLink} readOnly />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            const ok = await copyTextToClipboard(passwordResetLink, {
                              fallbackInput: passwordResetLinkInputRef.current,
                            });
                            if (ok) toast.success('Copied reset link');
                            else toast.error('Failed to copy');
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {isGlobalAdmin && selectedUser.id !== currentUser?.id && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full" disabled={deleteUserMutation.isPending}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete User
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete User</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete {selectedUser.username}? This action cannot be undone.
                        By default, sites and labels they created will be reassigned to System.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteUser(selectedUser.id, { cascade: true })}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete (Also Delete Sites/Labels)
                      </AlertDialogAction>
                      <AlertDialogAction
                        onClick={() => handleDeleteUser(selectedUser.id)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete (User Only)
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a user</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleDetailsOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={
                !selectedUser ||
                cannotEditSelectedUser ||
                updateUserSitesMutation.isPending ||
                updateUserIdentityMutation.isPending
              }
            >
              {updateUserSitesMutation.isPending || updateUserIdentityMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;