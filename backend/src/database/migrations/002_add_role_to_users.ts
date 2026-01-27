import type { Migration } from './index.js';

export const Migration002_AddRoleToUsers: Migration = {
  id: '002',
  name: 'Add role field to users table',
  
  up: (db) => {
    // Add role column to users table
    db.exec(`
      ALTER TABLE users 
      ADD COLUMN role TEXT NOT NULL DEFAULT 'user' 
      CHECK (role IN ('admin', 'moderator', 'user'))
    `);

    // Migrate existing role data from user_roles table to users table
    db.exec(`
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
    db.exec('CREATE INDEX idx_users_role ON users(role)');

    console.log('✅ Added role field to users table');
  },

  down: (db) => {
    // Remove the role column (SQLite doesn't support DROP COLUMN directly)
    // We need to recreate the table without the role column
    
    // Create temporary table without role column
    db.exec(`
      CREATE TABLE users_temp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        email_verified BOOLEAN DEFAULT 0,
        last_login_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Copy data from original table
    db.exec(`
      INSERT INTO users_temp (id, email, password_hash, full_name, is_active, email_verified, last_login_at, created_at, updated_at)
      SELECT id, email, password_hash, full_name, is_active, email_verified, last_login_at, created_at, updated_at
      FROM users
    `);

    // Drop original table and rename temp table
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_temp RENAME TO users');

    // Recreate indexes
    db.exec('CREATE INDEX idx_users_email ON users(email)');
    db.exec('CREATE INDEX idx_users_active ON users(is_active)');

    console.log('✅ Removed role field from users table');
  }
};