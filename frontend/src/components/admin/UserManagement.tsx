import React, { useState } from 'react';
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
  Shield,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';

import { apiClient } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { User, UserRole } from '../../types';

interface UserWithStats extends User {
  label_count: number;
  site_count: number;
  last_activity?: string;
}

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isGlobalAdmin = currentUser?.role === 'GLOBAL_ADMIN';
  const isSiteAdmin = currentUser?.role === 'ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [siteSelections, setSiteSelections] = useState<Record<number, 'ADMIN' | 'USER'>>({});
  const [selectedUserSites, setSelectedUserSites] = useState<Array<{ site_id: number; site_name: string; site_code: string; site_role: 'ADMIN' | 'USER' }>>([]);
  const queryClient = useQueryClient();

  const resetDialogState = () => {
    setSelectedUser(null);
    setSiteSelections({});
    setSelectedUserSites([]);
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

  const { data: sitesData } = useQuery({
    queryKey: ['admin', 'sites'],
    queryFn: async () => {
      const response = await apiClient.getSites({ limit: 1000 });
      return response.data;
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: UserRole }) => {
      return apiClient.put(`/admin/users/${userId}/role`, { role });
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
    mutationFn: async (userId: number) => apiClient.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User deleted successfully');
      handleDetailsOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete user');
    },
  });

  const updateUserSitesMutation = useMutation({
    mutationFn: async (data: {
      userId: number;
      sites: Array<{ site_id: number; site_role: 'ADMIN' | 'USER' }>;
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

  const handleDeleteUser = (userId: number) => {
    deleteUserMutation.mutate(userId);
  };

  const openUserDetails = async (user: UserWithStats) => {
    resetDialogState();
    setSelectedUser(user);
    handleDetailsOpenChange(true);

    try {
      const response = await apiClient.getUserSites(user.id);
      if (response.success && response.data?.sites) {
        const selections: Record<number, 'ADMIN' | 'USER'> = {};
        response.data.sites.forEach((site: any) => {
          selections[site.site_id] = site.site_role;
        });
        setSiteSelections(selections);
        setSelectedUserSites(response.data.sites as any);
      }
    } catch {
      // Ignore; show empty selections
    }
  };

  const handleSaveSites = () => {
    if (!selectedUser) return;
    const sites = Object.entries(siteSelections).map(([siteId, siteRole]) => ({
      site_id: Number(siteId),
      site_role: siteRole,
    }));
    updateUserSitesMutation.mutate({ userId: selectedUser.id, sites });
  };

  const cannotEditSelectedUser = !!selectedUser && !isGlobalAdmin && selectedUser.role === 'GLOBAL_ADMIN';

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'GLOBAL_ADMIN':
        return <ShieldCheck className="w-4 h-4" />;
      case 'ADMIN':
        return <Shield className="w-4 h-4" />;
      default:
        return <UserIcon className="w-4 h-4" />;
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'GLOBAL_ADMIN':
        return 'destructive';
      case 'ADMIN':
        return 'secondary';
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
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="USER">User</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead>Labels</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead>Joined</TableHead>
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
              usersData.users.map((user) => (
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
                      <span className="font-medium">{user.full_name}</span>
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
                    {user.last_activity ? (
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
                      aria-label={`Edit ${user.full_name}`}
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
                <div className="font-medium">{selectedUser.full_name}</div>
                <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
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
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="GLOBAL_ADMIN">Global Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : isSiteAdmin ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Global Role</div>
                  <Select
                    value={selectedUser.role}
                    onValueChange={(value) => handleRoleChange(selectedUser.id, value as UserRole)}
                    disabled={updateUserRoleMutation.isPending || cannotEditSelectedUser}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">User</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  {cannotEditSelectedUser && (
                    <div className="text-sm text-muted-foreground">
                      Site Admin cannot modify Global Admin users.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  You do not have permission to change global roles.
                </div>
              )}

              <div className="space-y-2">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Site Access
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3">
                  {(isGlobalAdmin ? sitesData?.sites : selectedUserSites)?.length ? (
                    (isGlobalAdmin ? (sitesData as any).sites : selectedUserSites).map((site: any) => {
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
                                return { ...prev, [siteId]: 'USER' };
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
                                [siteId]: value as 'ADMIN' | 'USER',
                              }))
                            }
                            disabled={cannotEditSelectedUser}
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
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No sites available</p>
                  )}
                </div>
              </div>

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
                        Are you sure you want to delete {selectedUser.full_name}? This action cannot be undone.
                        All their labels and sites will also be deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteUser(selectedUser.id)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete
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
            <Button onClick={handleSaveSites} disabled={!selectedUser || updateUserSitesMutation.isPending || cannotEditSelectedUser}>
              {updateUserSitesMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;