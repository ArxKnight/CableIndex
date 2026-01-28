import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
import { UserRole } from '../types/index.js';

export interface ToolPermission {
  id: number;
  user_id: number;
  tool_name: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  created_at: string;
  updated_at: string;
}

export interface RolePermissions {
  labels: { create: boolean; read: boolean; update: boolean; delete: boolean };
  sites: { create: boolean; read: boolean; update: boolean; delete: boolean };
  port_labels: { create: boolean; read: boolean; update: boolean; delete: boolean };
  pdu_labels: { create: boolean; read: boolean; update: boolean; delete: boolean };
  profile: { create: boolean; read: boolean; update: boolean; delete: boolean };
  users: { create: boolean; read: boolean; update: boolean; delete: boolean };
  admin: { create: boolean; read: boolean; update: boolean; delete: boolean };
}

export class RoleService {
  private get adapter(): DatabaseAdapter {
    return connection.getAdapter();
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: number, role: UserRole): Promise<boolean> {
    const result = await this.adapter.execute(
      `UPDATE users 
       SET role = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [role, userId]
    );
    
    if (result.affectedRows > 0) {
      // Update tool permissions based on new role
      await this.assignDefaultPermissions(userId, role);
      return true;
    }
    
    return false;
  }

  /**
   * Get user role
   */
  async getUserRole(userId: number): Promise<UserRole | null> {
    const rows = await this.adapter.query('SELECT role FROM users WHERE id = ?', [userId]);
    const result = rows[0] as { role: UserRole } | undefined;
    return result?.role || null;
  }

  /**
   * Check if user has required role (considering hierarchy)
   */
  async hasRole(userId: number, requiredRole: UserRole): Promise<boolean> {
    const userRole = await this.getUserRole(userId);
    if (!userRole) return false;

    const roleHierarchy: Record<UserRole, number> = {
      admin: 3,
      moderator: 2,
      user: 1,
    };

    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  }

  /**
   * Get user's tool permissions
   */
  async getUserPermissions(userId: number): Promise<ToolPermission[]> {
    const rows = await this.adapter.query(
      `SELECT * FROM tool_permissions 
       WHERE user_id = ?
       ORDER BY tool_name`,
      [userId]
    );
    
    return rows as ToolPermission[];
  }

  /**
   * Get user's permissions for a specific tool
   */
  async getToolPermission(userId: number, toolName: string): Promise<ToolPermission | null> {
    const rows = await this.adapter.query(
      `SELECT * FROM tool_permissions 
       WHERE user_id = ? AND tool_name = ?`,
      [userId, toolName]
    );
    
    return (rows[0] as ToolPermission | undefined) || null;
  }

  /**
   * Check if user has specific permission for a tool
   */
  async hasPermission(userId: number, toolName: string, action: 'create' | 'read' | 'update' | 'delete'): Promise<boolean> {
    const permission = await this.getToolPermission(userId, toolName);
    if (!permission) return false;

    switch (action) {
      case 'create': return permission.can_create;
      case 'read': return permission.can_read;
      case 'update': return permission.can_update;
      case 'delete': return permission.can_delete;
      default: return false;
    }
  }

  /**
   * Update tool permission for user
   */
  async updateToolPermission(
    userId: number, 
    toolName: string, 
    permissions: Partial<{ can_create: boolean; can_read: boolean; can_update: boolean; can_delete: boolean }>
  ): Promise<boolean> {
    const updates: string[] = [];
    const values: any[] = [];

    if (permissions.can_create !== undefined) {
      updates.push('can_create = ?');
      values.push(permissions.can_create);
    }
    if (permissions.can_read !== undefined) {
      updates.push('can_read = ?');
      values.push(permissions.can_read);
    }
    if (permissions.can_update !== undefined) {
      updates.push('can_update = ?');
      values.push(permissions.can_update);
    }
    if (permissions.can_delete !== undefined) {
      updates.push('can_delete = ?');
      values.push(permissions.can_delete);
    }

    if (updates.length === 0) return false;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId, toolName);

    const result = await this.adapter.execute(
      `UPDATE tool_permissions 
       SET ${updates.join(', ')}
       WHERE user_id = ? AND tool_name = ?`,
      values
    );
    return result.affectedRows > 0;
  }

  /**
   * Assign default permissions based on role
   */
  async assignDefaultPermissions(userId: number, role: UserRole): Promise<void> {
    const defaultPermissions = this.getDefaultPermissionsForRole(role);
    
    // Clear existing permissions
    await this.adapter.execute('DELETE FROM tool_permissions WHERE user_id = ?', [userId]);
    
    // Insert new permissions
    const insertSql = `
      INSERT INTO tool_permissions (user_id, tool_name, can_create, can_read, can_update, can_delete)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    for (const [toolName, perms] of Object.entries(defaultPermissions)) {
      await this.adapter.execute(insertSql, [userId, toolName, perms.create, perms.read, perms.update, perms.delete]);
    }
  }

  /**
   * Get default permissions for a role
   */
  private getDefaultPermissionsForRole(role: UserRole): RolePermissions {
    const basePermissions: RolePermissions = {
      labels: { create: false, read: false, update: false, delete: false },
      sites: { create: false, read: false, update: false, delete: false },
      port_labels: { create: false, read: false, update: false, delete: false },
      pdu_labels: { create: false, read: false, update: false, delete: false },
      profile: { create: false, read: false, update: false, delete: false },
      users: { create: false, read: false, update: false, delete: false },
      admin: { create: false, read: false, update: false, delete: false },
    };

    switch (role) {
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
  }

  /**
   * Get all users with their roles (admin only)
   */
  async getAllUsersWithRoles(limit: number = 50, offset: number = 0): Promise<Array<{
    id: number;
    email: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>> {
    const safeLimit = parseInt(String(limit), 10) || 50;
    const safeOffset = parseInt(String(offset), 10) || 0;
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    const finalLimit = Math.max(0, safeLimit);
    const finalOffset = Math.max(0, safeOffset);

    const query = isMySQL
      ? `SELECT id, email, full_name, role, is_active, created_at, updated_at
         FROM users 
         ORDER BY created_at DESC
         LIMIT ${finalLimit} OFFSET ${finalOffset}`
      : `SELECT id, email, full_name, role, is_active, created_at, updated_at
         FROM users 
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`;

    const params = isMySQL ? [] : [finalLimit, finalOffset];
    const rows = await this.adapter.query(query, params);
    
    return rows as Array<{
      id: number;
      email: string;
      full_name: string;
      role: UserRole;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>;
  }

  /**
   * Count users by role
   */
  async countUsersByRole(): Promise<Record<UserRole, number>> {
    const results = await this.adapter.query(
      `SELECT role, COUNT(*) as count 
       FROM users 
       GROUP BY role`
    ) as Array<{ role: UserRole; count: number }>;
    
    const counts: Record<UserRole, number> = {
      admin: 0,
      moderator: 0,
      user: 0,
    };

    results.forEach(result => {
      counts[result.role] = result.count;
    });

    return counts;
  }
}

export default RoleService;