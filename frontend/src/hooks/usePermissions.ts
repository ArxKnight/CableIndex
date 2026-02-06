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
  canAdministerSite: (siteId: number) => boolean;
  canAccess: (tool: string) => boolean;
  canCreate: (tool: string) => boolean;
  canRead: (tool: string) => boolean;
  canUpdate: (tool: string) => boolean;
  canDelete: (tool: string) => boolean;
  isAdmin: boolean;
  isGlobalAdmin: boolean;
  isUser: boolean;
  permissions: UserPermissions;
}

/**
 * Hook to check user permissions based on role
 */
export const usePermissions = (): PermissionHook => {
  const { user, memberships } = useAuth();

  const isGlobalAdmin = user?.role === 'GLOBAL_ADMIN';
  const adminSiteIds = useMemo(() => {
    return (memberships ?? [])
      .filter(m => m.site_role === 'SITE_ADMIN')
      .map(m => m.site_id)
      .filter((id): id is number => Number.isFinite(id));
  }, [memberships]);

  const hasAdminAccess = Boolean(isGlobalAdmin || adminSiteIds.length > 0);

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

    if (isGlobalAdmin) {
      return {
        labels: { create: true, read: true, update: true, delete: true },
        sites: { create: true, read: true, update: true, delete: true },
        port_labels: { create: true, read: true, update: true, delete: true },
        pdu_labels: { create: true, read: true, update: true, delete: true },
        profile: { create: false, read: true, update: true, delete: false },
        users: { create: true, read: true, update: true, delete: true },
        admin: { create: true, read: true, update: true, delete: true },
      };
    }

    // Default USER permissions; SITE_ADMIN gets extra access via memberships.
    const base = {
      labels: { create: true, read: true, update: true, delete: true },
      sites: { create: false, read: true, update: false, delete: false },
      port_labels: { create: true, read: true, update: false, delete: false },
      pdu_labels: { create: true, read: true, update: false, delete: false },
      profile: { create: false, read: true, update: true, delete: false },
      users: { create: false, read: false, update: false, delete: false },
      admin: { create: false, read: false, update: false, delete: false },
    } satisfies UserPermissions;

    if (!hasAdminAccess) return base;

    return {
      ...base,
      users: { create: false, read: true, update: true, delete: false },
      admin: { create: true, read: true, update: true, delete: false },
    };
  }, [user, isGlobalAdmin, hasAdminAccess]);

  const hasRole = (role: UserRole): boolean => {
    if (!user) return false;

    const roleHierarchy: Record<UserRole, number> = {
      GLOBAL_ADMIN: 2,
      USER: 1,
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

  const canAdministerSite = (siteId: number): boolean => {
    if (!user) return false;
    if (isGlobalAdmin) return true;
    return adminSiteIds.includes(siteId);
  };

  return {
    hasRole,
    canAdministerSite,
    canAccess,
    canCreate,
    canRead,
    canUpdate,
    canDelete,
    isAdmin: hasAdminAccess,
    isGlobalAdmin,
    isUser: user?.role === 'USER',
    permissions,
  };
};

export default usePermissions;