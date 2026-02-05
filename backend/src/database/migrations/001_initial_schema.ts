import type { Migration } from './index.js';

export const Migration001_InitialSchema: Migration = {
  id: '001',
  name: 'Initial Schema',
  
  up: async (adapter) => {
    // Users table
    await adapter.execute(
      `CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'USER',
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_users_email ON users(email)');
    await adapter.execute('CREATE INDEX idx_users_active ON users(is_active)');
    await adapter.execute('CREATE INDEX idx_users_role ON users(role)');

    // Sites table
    await adapter.execute(
      `CREATE TABLE sites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(255) UNIQUE NOT NULL,
        created_by INT NOT NULL,
        location VARCHAR(500),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_sites_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_sites_created_by ON sites(created_by)');
    await adapter.execute('CREATE INDEX idx_sites_active ON sites(is_active)');
    await adapter.execute('CREATE INDEX idx_sites_name ON sites(name)');
    await adapter.execute('CREATE INDEX idx_sites_code ON sites(code)');

    // Site memberships table
    await adapter.execute(
      `CREATE TABLE site_memberships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        user_id INT NOT NULL,
        site_role VARCHAR(50) NOT NULL,
        CONSTRAINT fk_site_memberships_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CONSTRAINT fk_site_memberships_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_site_user (site_id, user_id)
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_site_memberships_site_id ON site_memberships(site_id)');
    await adapter.execute('CREATE INDEX idx_site_memberships_user_id ON site_memberships(user_id)');
    await adapter.execute('CREATE INDEX idx_site_memberships_role ON site_memberships(site_role)');

    // Labels table
    await adapter.execute(
      `CREATE TABLE labels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        ref_number INT NOT NULL,
        ref_string VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        payload_json TEXT NULL,
        created_by INT NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_labels_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CONSTRAINT fk_labels_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_site_ref_number (site_id, ref_number),
        UNIQUE KEY unique_site_ref_string (site_id, ref_string)
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_labels_site_id ON labels(site_id)');
    await adapter.execute('CREATE INDEX idx_labels_created_by ON labels(created_by)');
    await adapter.execute('CREATE INDEX idx_labels_ref_string ON labels(ref_string)');

    // Application settings table
    await adapter.execute(
      `CREATE TABLE app_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(255) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_app_settings_key ON app_settings(`key`)');

    // Invitations table
    await adapter.execute(
      `CREATE TABLE invitations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        invited_by INT NOT NULL,
        expires_at TIMESTAMP(3) NOT NULL,
        used_at TIMESTAMP(3) NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_invitations_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_invitations_email ON invitations(email)');
    await adapter.execute('CREATE INDEX idx_invitations_token ON invitations(token_hash)');
    await adapter.execute('CREATE INDEX idx_invitations_expires ON invitations(expires_at)');

    // Invitation sites table
    await adapter.execute(
      `CREATE TABLE invitation_sites (
        invitation_id INT NOT NULL,
        site_id INT NOT NULL,
        site_role VARCHAR(50) NOT NULL,
        CONSTRAINT fk_invitation_sites_invitation_id FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
        CONSTRAINT fk_invitation_sites_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_invitation_sites_invitation ON invitation_sites(invitation_id)');
    await adapter.execute('CREATE INDEX idx_invitation_sites_site ON invitation_sites(site_id)');

    // Site counters table
    await adapter.execute(
      `CREATE TABLE site_counters (
        site_id INT PRIMARY KEY,
        next_ref INT NOT NULL,
        CONSTRAINT fk_site_counters_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`
    );

    console.log('✅ Initial schema created successfully');
  },

  down: async (adapter) => {
    // Drop tables in reverse order (respecting foreign key constraints)
    await adapter.execute('DROP TABLE IF EXISTS site_counters');
    await adapter.execute('DROP TABLE IF EXISTS invitation_sites');
    await adapter.execute('DROP TABLE IF EXISTS invitations');
    await adapter.execute('DROP TABLE IF EXISTS app_settings');
    await adapter.execute('DROP TABLE IF EXISTS labels');
    await adapter.execute('DROP TABLE IF EXISTS site_memberships');
    await adapter.execute('DROP TABLE IF EXISTS sites');
    await adapter.execute('DROP TABLE IF EXISTS users');

    console.log('✅ Initial schema dropped successfully');
  }
};
