import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Search,
  Trash2,
  Shield,
  ShieldCheck,
  User as UserIcon,
  Users,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { apiClient } from '../../lib/api';
import { User, UserRole } from '../../types';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';

interface UserWithStats extends User {
  label_count: number;
  site_count: number;
  last_activity?: string;
}

const UserManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [siteSelections, setSiteSelections] = useState<Record<number, 'ADMIN' | 'USER'>>({});
  const queryClient = useQueryClient();

  // Fetch users with statistics
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

  // Update user role mutation
  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: UserRole }) => {
      return apiClient.put(`/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User role updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update user role');
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiClient.delete(`/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete user');
    },
  });

  const updateUserSitesMutation = useMutation({
    mutationFn: async (data: { userId: number; sites: Array<{ site_id: number; site_role: 'ADMIN' | 'USER' }> }) => {
      return apiClient.updateUserSites(data.userId, data.sites);
    },
    onSuccess: () => {
      toast.success('User site access updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSiteDialogOpen(false);
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

  const handleManageSites = async (user: UserWithStats) => {
    setSelectedUser(user);
    setSiteDialogOpen(true);
    try {
      const response = await apiClient.getUserSites(user.id);
      if (response.success && response.data?.sites) {
        const selections: Record<number, 'ADMIN' | 'USER'> = {};
        response.data.sites.forEach((site: any) => {
          selections[site.site_id] = site.site_role;
        });
        setSiteSelections(selections);
      } else {
        setSiteSelections({});
      }
    } catch (error) {
      setSiteSelections({});
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
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
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

      {/* Users Table */}
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
              <TableHead className="text-right">Actions</TableHead>
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
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.full_name}</span>
                      <span className="text-sm text-gray-500">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={getRoleBadgeVariant(user.role)}
                      className="flex items-center gap-1 w-fit"
                    >
                      {getRoleIcon(user.role)}
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.last_activity ? (
                      <span className="text-sm text-gray-600">
                        {formatDistanceToNow(new Date(user.last_activity), { addSuffix: true })}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{user.label_count}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{user.site_count}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(user.id, 'GLOBAL_ADMIN')}
                          disabled={user.role === 'GLOBAL_ADMIN'}
                        >
                          <ShieldCheck className="w-4 h-4 mr-2" />
                          Make Global Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(user.id, 'ADMIN')}
                          disabled={user.role === 'ADMIN'}
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Make Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(user.id, 'USER')}
                          disabled={user.role === 'USER'}
                        >
                          <UserIcon className="w-4 h-4 mr-2" />
                          Make User
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleManageSites(user)}>
                          <Users className="w-4 h-4 mr-2" />
                          Manage Sites
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {user.full_name}? This action cannot be undone.
                                All their labels and sites will also be deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUser(user.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Site Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selectedUser ? `Editing access for ${selectedUser.full_name}` : 'Select a user'}
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3">
              {sitesData?.sites?.length ? (
                sitesData.sites.map((site: any) => (
                  <div key={site.id} className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(siteSelections[site.id])}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSiteSelections((prev) => {
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
                    {siteSelections[site.id] && (
                      <Select
                        value={siteSelections[site.id]}
                        onValueChange={(value) =>
                          setSiteSelections((prev) => ({
                            ...prev,
                            [site.id]: value as 'ADMIN' | 'USER',
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
              variant="outline"
              onClick={() => setSiteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSites} disabled={!selectedUser || updateUserSitesMutation.isPending}>
              {updateUserSitesMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;