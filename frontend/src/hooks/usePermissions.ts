import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

export interface ToolPermissions {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

export interface UserPermissions {
  labels: ToolPermissions;
  sites: ToolPermissions;
  port_labels: ToolPermissions;
  pdu_labels: ToolPermissions;
  profile: ToolPermissions;
  users: ToolPermissions;
  admin: ToolPermissions;
}

export interface PermissionHook {
  hasRole: (role: UserRole) => boolean;
  canAccess: (tool: string) => boolean;
  canCreate: (tool: string) => boolean;
  canRead: (tool: string) => boolean;
  canUpdate: (tool: string) => boolean;
  canDelete: (tool: string) => boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isUser: boolean;
  permissions: UserPermissions;
}

/**
 * Hook to check user permissions based on role
 */
export const usePermissions = (): PermissionHook => {
  const { user } = useAuth();

  const permissions = useMemo((): UserPermissions => {
    if (!user) {
      // No permissions for unauthenticated users
      return {
        labels: { create: false, read: false, update: false, delete: false },
        sites: { create: false, read: false, update: false, delete: false },
        port_labels: { create: false, read: false, update: false, delete: false },
        pdu_labels: { create: false, read: false, update: false, delete: false },
        profile: { create: false, read: false, update: false, delete: false },
        users: { create: false, read: false, update: false, delete: false },
        admin: { create: false, read: false, update: false, delete: false },
      };
    }

    // Define permissions based on role
    switch (user.role) {
      case 'admin':
        return {
          labels: { create: true, read: true, update: true, delete: true },
          sites: { create: true, read: true, update: true, delete: true },
          port_labels: { create: true, read: true, update: true, delete: true },
          pdu_labels: { create: true, read: true, update: true, delete: true },
          profile: { create: false, read: true, update: true, delete: false },
          users: { create: true, read: true, update: true, delete: true },
          admin: { create: true, read: true, update: true, delete: true },
        };

      case 'moderator':
        return {
          labels: { create: true, read: true, update: true, delete: true },
          sites: { create: true, read: true, update: true, delete: true },
          port_labels: { create: true, read: true, update: true, delete: false },
          pdu_labels: { create: true, read: true, update: true, delete: false },
          profile: { create: false, read: true, update: true, delete: false },
          users: { create: false, read: true, update: false, delete: false },
          admin: { create: false, read: true, update: false, delete: false },
        };

      case 'user':
      default:
        return {
          labels: { create: true, read: true, update: true, delete: true },
          sites: { create: true, read: true, update: true, delete: true },
          port_labels: { create: true, read: true, update: false, delete: false },
          pdu_labels: { create: true, read: true, update: false, delete: false },
          profile: { create: false, read: true, update: true, delete: false },
          users: { create: false, read: false, update: false, delete: false },
          admin: { create: false, read: false, update: false, delete: false },
        };
    }
  }, [user]);

  const hasRole = (role: UserRole): boolean => {
    if (!user) return false;

    const roleHierarchy: Record<UserRole, number> = {
      admin: 3,
      moderator: 2,
      user: 1,
    };

    return roleHierarchy[user.role] >= roleHierarchy[role];
  };

  const canAccess = (tool: string): boolean => {
    const toolPermissions = permissions[tool as keyof UserPermissions];
    if (!toolPermissions) return false;
    
    // User can access if they have any permission for the tool
    return toolPermissions.create || toolPermissions.read || toolPermissions.update || toolPermissions.delete;
  };

  const canCreate = (tool: string): boolean => {
    const toolPermissions = permissions[tool as keyof UserPermissions];
    return toolPermissions?.create || false;
  };

  const canRead = (tool: string): boolean => {
    const toolPermissions = permissions[tool as keyof UserPermissions];
    return toolPermissions?.read || false;
  };

  const canUpdate = (tool: string): boolean => {
    const toolPermissions = permissions[tool as keyof UserPermissions];
    return toolPermissions?.update || false;
  };

  const canDelete = (tool: string): boolean => {
    const toolPermissions = permissions[tool as keyof UserPermissions];
    return toolPermissions?.delete || false;
  };

  return {
    hasRole,
    canAccess,
    canCreate,
    canRead,
    canUpdate,
    canDelete,
    isAdmin: hasRole('admin'),
    isModerator: hasRole('moderator'),
    isUser: user?.role === 'user',
    permissions,
  };
};

export default usePermissions;