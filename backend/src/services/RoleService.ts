import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
import { UserRole } from '../types/index.js';

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

    return result.affectedRows > 0;
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
      GLOBAL_ADMIN: 2,
      USER: 1,
    };

    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  }

  /**
   * Get all users with their roles (admin only)
   */
  async getAllUsersWithRoles(limit: number = 50, offset: number = 0): Promise<Array<{
    id: number;
    email: string;
    username: string;
    role: UserRole;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>> {
    const safeLimit = parseInt(String(limit), 10) || 50;
    const safeOffset = parseInt(String(offset), 10) || 0;
    const finalLimit = Math.max(0, safeLimit);
    const finalOffset = Math.max(0, safeOffset);

    const query = `SELECT
          id,
          email,
          username,
          CASE
            WHEN role = 'ADMIN' THEN 'GLOBAL_ADMIN'
            WHEN role = 'MODERATOR' THEN 'USER'
            ELSE role
          END as role,
          is_active,
          created_at,
          updated_at
        FROM users
        ORDER BY created_at DESC
        LIMIT ${finalLimit} OFFSET ${finalOffset}`;

    const rows = await this.adapter.query(query);
    
    return rows as Array<{
      id: number;
      email: string;
      username: string;
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
      `SELECT
          CASE
            WHEN role = 'ADMIN' THEN 'GLOBAL_ADMIN'
            WHEN role = 'MODERATOR' THEN 'USER'
            ELSE role
          END as role,
          COUNT(*) as count
       FROM users
       GROUP BY role`
    ) as Array<{ role: UserRole; count: number }>;
    
    const counts: Record<UserRole, number> = {
      GLOBAL_ADMIN: 0,
      USER: 0,
    };

    results.forEach(result => {
      if (result.role === 'GLOBAL_ADMIN' || result.role === 'USER') {
        counts[result.role] = result.count;
      }
    });

    return counts;
  }
}

export default RoleService;