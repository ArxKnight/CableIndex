import type { Migration } from './index.js';

export const Migration001_InitialSchema: Migration = {
  id: '001',
  name: 'Initial Schema',
  
  up: (db) => {
    // Users table - core authentication and profile information
    db.exec(`
      CREATE TABLE users (
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

    // Create index on email for faster lookups
    db.exec('CREATE INDEX idx_users_email ON users(email)');
    db.exec('CREATE INDEX idx_users_active ON users(is_active)');

    // User roles table - role assignments (admin, moderator, user)
    db.exec(`
      CREATE TABLE user_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'user')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, role)
      )
    `);

    db.exec('CREATE INDEX idx_user_roles_user_id ON user_roles(user_id)');
    db.exec('CREATE INDEX idx_user_roles_role ON user_roles(role)');

    // Tool permissions table - granular access control per user/tool
    db.exec(`
      CREATE TABLE tool_permissions (
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
      )
    `);

    db.exec('CREATE INDEX idx_tool_permissions_user_id ON tool_permissions(user_id)');
    db.exec('CREATE INDEX idx_tool_permissions_tool ON tool_permissions(tool_name)');

    // Sites table - physical locations for cable management
    db.exec(`
      CREATE TABLE sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        description TEXT,
        user_id INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    db.exec('CREATE INDEX idx_sites_user_id ON sites(user_id)');
    db.exec('CREATE INDEX idx_sites_active ON sites(is_active)');
    db.exec('CREATE INDEX idx_sites_name ON sites(name)');

    // Labels table - cable label records with references
    db.exec(`
      CREATE TABLE labels (
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
      )
    `);

    db.exec('CREATE INDEX idx_labels_site_id ON labels(site_id)');
    db.exec('CREATE INDEX idx_labels_user_id ON labels(user_id)');
    db.exec('CREATE INDEX idx_labels_reference ON labels(reference_number)');
    db.exec('CREATE INDEX idx_labels_source ON labels(source)');
    db.exec('CREATE INDEX idx_labels_destination ON labels(destination)');
    db.exec('CREATE INDEX idx_labels_active ON labels(is_active)');

    // Application settings table - centralized configuration storage
    db.exec(`
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec('CREATE INDEX idx_app_settings_key ON app_settings(key)');

    // User invitations table - pending user invitations with tokens
    db.exec(`
      CREATE TABLE user_invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        invited_by INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'moderator', 'user')),
        expires_at DATETIME NOT NULL,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    db.exec('CREATE INDEX idx_user_invitations_email ON user_invitations(email)');
    db.exec('CREATE INDEX idx_user_invitations_token ON user_invitations(token)');
    db.exec('CREATE INDEX idx_user_invitations_expires ON user_invitations(expires_at)');

    // Create triggers for automatic timestamp updates
    db.exec(`
      CREATE TRIGGER update_users_timestamp 
      AFTER UPDATE ON users
      BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    db.exec(`
      CREATE TRIGGER update_tool_permissions_timestamp 
      AFTER UPDATE ON tool_permissions
      BEGIN
        UPDATE tool_permissions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    db.exec(`
      CREATE TRIGGER update_sites_timestamp 
      AFTER UPDATE ON sites
      BEGIN
        UPDATE sites SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    db.exec(`
      CREATE TRIGGER update_labels_timestamp 
      AFTER UPDATE ON labels
      BEGIN
        UPDATE labels SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    db.exec(`
      CREATE TRIGGER update_app_settings_timestamp 
      AFTER UPDATE ON app_settings
      BEGIN
        UPDATE app_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    // Create trigger for automatic default permissions assignment
    db.exec(`
      CREATE TRIGGER assign_default_permissions
      AFTER INSERT ON users
      BEGIN
        -- Assign default user role
        INSERT INTO user_roles (user_id, role) VALUES (NEW.id, 'user');
        
        -- Assign default tool permissions for basic user
        INSERT INTO tool_permissions (user_id, tool_name, can_create, can_read, can_update, can_delete) VALUES
        (NEW.id, 'labels', 1, 1, 1, 1),
        (NEW.id, 'sites', 1, 1, 1, 1),
        (NEW.id, 'port_labels', 1, 1, 0, 0),
        (NEW.id, 'pdu_labels', 1, 1, 0, 0),
        (NEW.id, 'profile', 0, 1, 1, 0);
      END
    `);

    // Create trigger for reference number auto-increment
    db.exec(`
      CREATE TRIGGER auto_increment_reference
      AFTER INSERT ON labels
      WHEN NEW.reference_number IS NULL OR NEW.reference_number = ''
      BEGIN
        UPDATE labels 
        SET reference_number = (
          SELECT COALESCE(
            MAX(CAST(SUBSTR(reference_number, INSTR(reference_number, '-') + 1) AS INTEGER)), 
            0
          ) + 1
          FROM labels 
          WHERE site_id = NEW.site_id 
          AND reference_number LIKE (
            SELECT name || '-%' 
            FROM sites 
            WHERE id = NEW.site_id
          )
        )
        WHERE id = NEW.id;
      END
    `);

    console.log('✅ Initial schema created successfully');
  },

  down: (db) => {
    // Drop triggers first
    db.exec('DROP TRIGGER IF EXISTS auto_increment_reference');
    db.exec('DROP TRIGGER IF EXISTS assign_default_permissions');
    db.exec('DROP TRIGGER IF EXISTS update_app_settings_timestamp');
    db.exec('DROP TRIGGER IF EXISTS update_labels_timestamp');
    db.exec('DROP TRIGGER IF EXISTS update_sites_timestamp');
    db.exec('DROP TRIGGER IF EXISTS update_tool_permissions_timestamp');
    db.exec('DROP TRIGGER IF EXISTS update_users_timestamp');

    // Drop tables in reverse order (respecting foreign key constraints)
    db.exec('DROP TABLE IF EXISTS user_invitations');
    db.exec('DROP TABLE IF EXISTS app_settings');
    db.exec('DROP TABLE IF EXISTS labels');
    db.exec('DROP TABLE IF EXISTS sites');
    db.exec('DROP TABLE IF EXISTS tool_permissions');
    db.exec('DROP TABLE IF EXISTS user_roles');
    db.exec('DROP TABLE IF EXISTS users');

    console.log('✅ Initial schema dropped successfully');
  }
};