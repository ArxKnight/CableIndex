import type { Migration } from './index.js';
import { columnExists, tableExists } from './schemaChecks.js';

export const Migration002_AddRoleToUsers: Migration = {
  id: '002',
  name: 'Add role field to users table (global roles)',
  
  up: async (adapter) => {
    // Add role column to users table (if not already present)
    const hasRoleColumn = await columnExists(adapter, 'users', 'role');
    if (!hasRoleColumn) {
      await adapter.execute(`ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'USER'`);
    }

    // Migrate existing role data from user_roles table to users table (if it exists)
    const hasUserRolesTable = await tableExists(adapter, 'user_roles');
    if (hasUserRolesTable) {
      await adapter.execute(`
        UPDATE users
        SET role = (
          SELECT role
          FROM user_roles
          WHERE user_roles.user_id = users.id
          LIMIT 1
        )
        WHERE EXISTS (
          SELECT 1
          FROM user_roles
          WHERE user_roles.user_id = users.id
        )
      `);
    }

    // Normalize legacy roles to new global roles
    if (hasRoleColumn || (await columnExists(adapter, 'users', 'role'))) {
      await adapter.execute(
        `UPDATE users
         SET role = CASE
           WHEN role IN ('admin', 'ADMIN') THEN 'GLOBAL_ADMIN'
           WHEN role IN ('moderator', 'MODERATOR') THEN 'ADMIN'
           WHEN role IN ('user', 'USER') THEN 'USER'
           ELSE role
         END`
      );
    }

    console.log('✅ Added role field to users table');
  },

  down: async () => {
    console.log('⚠️  Role migration rollback not supported');
  }
};
