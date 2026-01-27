import type { Migration } from './index.js';
import connection from '../connection.js';

export const Migration001_InitialSchema: Migration = {
  id: '001',
  name: 'Initial Schema',
  
  up: async (adapter) => {
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';

    // Helper function to get correct SQL for each database type
    const getSQL = (sqlite: string, mysql: string) => isMySQL ? mysql : sqlite;

    // Users table
    await adapter.execute(getSQL(
      `CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        email_verified BOOLEAN DEFAULT 0,
        last_login_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        email_verified BOOLEAN DEFAULT 0,
        last_login_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    ));

    await adapter.execute('CREATE INDEX idx_users_email ON users(email)');
    await adapter.execute('CREATE INDEX idx_users_active ON users(is_active)');

    // User roles table
    await adapter.execute(getSQL(
      `CREATE TABLE user_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'user')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, role)
      )`,
      `CREATE TABLE user_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_role (user_id, role),
        CHECK (role IN ('admin', 'moderator', 'user'))
      )`
    ));

    await adapter.execute('CREATE INDEX idx_user_roles_user_id ON user_roles(user_id)');
    await adapter.execute('CREATE INDEX idx_user_roles_role ON user_roles(role)');

    // Tool permissions table
    await adapter.execute(getSQL(
      `CREATE TABLE tool_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        can_create BOOLEAN DEFAULT 0,
        can_read BOOLEAN DEFAULT 1,
        can_update BOOLEAN DEFAULT 0,
        can_delete BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, tool_name)
      )`,
      `CREATE TABLE tool_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        tool_name VARCHAR(100) NOT NULL,
        can_create BOOLEAN DEFAULT 0,
        can_read BOOLEAN DEFAULT 1,
        can_update BOOLEAN DEFAULT 0,
        can_delete BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_tool (user_id, tool_name)
      )`
    ));

    await adapter.execute('CREATE INDEX idx_tool_permissions_user_id ON tool_permissions(user_id)');
    await adapter.execute('CREATE INDEX idx_tool_permissions_tool ON tool_permissions(tool_name)');

    // Sites table
    await adapter.execute(getSQL(
      `CREATE TABLE sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        description TEXT,
        user_id INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE sites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(500),
        description TEXT,
        user_id INT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    ));

    await adapter.execute('CREATE INDEX idx_sites_user_id ON sites(user_id)');
    await adapter.execute('CREATE INDEX idx_sites_active ON sites(is_active)');
    await adapter.execute('CREATE INDEX idx_sites_name ON sites(name)');

    // Labels table
    await adapter.execute(getSQL(
      `CREATE TABLE labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference_number TEXT NOT NULL,
        site_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        destination TEXT NOT NULL,
        notes TEXT,
        zpl_content TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(site_id, reference_number)
      )`,
      `CREATE TABLE labels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reference_number VARCHAR(255) NOT NULL,
        site_id INT NOT NULL,
        user_id INT NOT NULL,
        source VARCHAR(500) NOT NULL,
        destination VARCHAR(500) NOT NULL,
        notes TEXT,
        zpl_content TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_site_reference (site_id, reference_number)
      )`
    ));

    await adapter.execute('CREATE INDEX idx_labels_site_id ON labels(site_id)');
    await adapter.execute('CREATE INDEX idx_labels_user_id ON labels(user_id)');
    await adapter.execute('CREATE INDEX idx_labels_reference ON labels(reference_number)');
    await adapter.execute('CREATE INDEX idx_labels_source ON labels(source)');
    await adapter.execute('CREATE INDEX idx_labels_destination ON labels(destination)');
    await adapter.execute('CREATE INDEX idx_labels_active ON labels(is_active)');

    // Application settings table
    await adapter.execute(getSQL(
      `CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE app_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(255) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    ));

    await adapter.execute(getSQL(
      'CREATE INDEX idx_app_settings_key ON app_settings(key)',
      'CREATE INDEX idx_app_settings_key ON app_settings(`key`)'
    ));

    // User invitations table
    await adapter.execute(getSQL(
      `CREATE TABLE user_invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        invited_by INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'moderator', 'user')),
        expires_at DATETIME NOT NULL,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE user_invitations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        invited_by INT NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
        CHECK (role IN ('admin', 'moderator', 'user'))
      )`
    ));

    await adapter.execute('CREATE INDEX idx_user_invitations_email ON user_invitations(email)');
    await adapter.execute('CREATE INDEX idx_user_invitations_token ON user_invitations(token)');
    await adapter.execute('CREATE INDEX idx_user_invitations_expires ON user_invitations(expires_at)');

    console.log('✅ Initial schema created successfully');
  },

  down: async (adapter) => {
    // Drop tables in reverse order (respecting foreign key constraints)
    await adapter.execute('DROP TABLE IF EXISTS user_invitations');
    await adapter.execute('DROP TABLE IF EXISTS app_settings');
    await adapter.execute('DROP TABLE IF EXISTS labels');
    await adapter.execute('DROP TABLE IF EXISTS sites');
    await adapter.execute('DROP TABLE IF EXISTS tool_permissions');
    await adapter.execute('DROP TABLE IF EXISTS user_roles');
    await adapter.execute('DROP TABLE IF EXISTS users');

    console.log('✅ Initial schema dropped successfully');
  }
};
