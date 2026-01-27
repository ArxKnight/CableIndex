import type { Migration } from './index.js';
import connection from '../connection.js';

export const Migration002_AddRoleToUsers: Migration = {
  id: '002',
  name: 'Add role field to users table',
  
  up: async (adapter) => {
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';

    // Add role column to users table
    await adapter.execute(isMySQL 
      ? `ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user'`
      : `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'moderator', 'user'))`
    );

    // For MySQL, add the CHECK constraint separately (if supported in your MySQL version)
    if (isMySQL) {
      try {
        await adapter.execute(`ALTER TABLE users ADD CONSTRAINT chk_user_role CHECK (role IN ('admin', 'moderator', 'user'))`);
      } catch (error) {
        // Older MySQL versions don't support CHECK constraints, that's okay
        console.log('⚠️  CHECK constraint not supported, skipping');
      }
    }

    // Migrate existing role data from user_roles table to users table
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

    // Create index on role for faster lookups
    await adapter.execute('CREATE INDEX idx_users_role ON users(role)');

    console.log('✅ Added role field to users table');
  },

  down: async (adapter) => {
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';

    // MySQL can drop columns directly
    if (isMySQL) {
      await adapter.execute('ALTER TABLE users DROP COLUMN role');
    } else {
      // SQLite requires table recreation (complex, skip for now)
      console.log('⚠️  SQLite rollback not fully implemented for this migration');
    }

    console.log('✅ Removed role field from users table');
  }
};
