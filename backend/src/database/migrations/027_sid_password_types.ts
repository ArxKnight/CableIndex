import type { Migration } from './index.js';

export const Migration027_SidPasswordTypes: Migration = {
  id: '027',
  name: 'sid_password_types',

  up: async (adapter) => {
    // Site-scoped password type picklist (e.g., OS / iDRAC / iLO)
    try {
      await adapter.execute(
        `CREATE TABLE sid_password_types (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          description VARCHAR(5000) NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_password_types_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          UNIQUE KEY uq_sid_password_types_site_name (site_id, name)
        ) ENGINE=InnoDB`
      );
    } catch {
      // ignore
    }

    // Seed a default type so existing single-password SIDs map cleanly.
    try {
      await adapter.execute(
        `INSERT IGNORE INTO sid_password_types (site_id, name, description)
         SELECT s.id as site_id, 'OS Credentials' as name, NULL as description
         FROM sites s`
      );
    } catch {
      // ignore
    }

    // Upgrade sid_passwords to allow multiple credential rows per SID.
    try {
      await adapter.execute('ALTER TABLE sid_passwords ADD COLUMN password_type_id INT NULL AFTER sid_id');
    } catch {
      // ignore
    }

    // Backfill existing rows to the default type.
    try {
      await adapter.execute(
        `UPDATE sid_passwords p
         JOIN sids s ON s.id = p.sid_id
         JOIN sid_password_types t ON t.site_id = s.site_id AND t.name = 'OS Credentials'
         SET p.password_type_id = t.id
         WHERE p.password_type_id IS NULL`
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sid_passwords MODIFY password_type_id INT NOT NULL');
    } catch {
      // ignore
    }

    // Switch PK from sid_id to (sid_id, password_type_id)
    try {
      await adapter.execute('ALTER TABLE sid_passwords DROP PRIMARY KEY');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sid_passwords ADD PRIMARY KEY (sid_id, password_type_id)');
    } catch {
      // ignore
    }

    try {
      await adapter.execute(
        `ALTER TABLE sid_passwords
         ADD CONSTRAINT fk_sid_passwords_type
         FOREIGN KEY (password_type_id) REFERENCES sid_password_types(id) ON DELETE CASCADE`
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute('CREATE INDEX idx_sid_passwords_type ON sid_passwords(password_type_id)');
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
    try {
      await adapter.execute('ALTER TABLE sid_passwords DROP FOREIGN KEY fk_sid_passwords_type');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sid_passwords DROP PRIMARY KEY');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sid_passwords DROP COLUMN password_type_id');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sid_passwords ADD PRIMARY KEY (sid_id)');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_password_types');
    } catch {
      // ignore
    }
  },
};
