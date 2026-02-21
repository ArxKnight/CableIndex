import type { Migration } from './index.js';

export const Migration023_SidHistoryPasswords: Migration = {
  id: '023',
  name: 'sid_history_passwords',

  up: async (adapter) => {
    // SID-scoped activity log for the Update History tab
    try {
      await adapter.execute(
        `CREATE TABLE sid_activity_log (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          sid_id INT NOT NULL,
          actor_user_id INT NOT NULL,
          action VARCHAR(100) NOT NULL,
          summary VARCHAR(500) NOT NULL,
          diff_json TEXT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_activity_log_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          CONSTRAINT fk_sid_activity_log_sid FOREIGN KEY (sid_id) REFERENCES sids(id) ON DELETE CASCADE,
          CONSTRAINT fk_sid_activity_log_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute('CREATE INDEX idx_sid_activity_log_sid_created ON sid_activity_log(sid_id, created_at)');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('CREATE INDEX idx_sid_activity_log_site_created ON sid_activity_log(site_id, created_at)');
    } catch {
      // ignore
    }

    // Encrypted password storage for OS login details
    // Note: the API does not return decrypted passwords.
    try {
      await adapter.execute(
        `CREATE TABLE sid_passwords (
          sid_id INT NOT NULL PRIMARY KEY,
          username VARCHAR(255) NULL,
          password_ciphertext TEXT NULL,
          password_updated_by INT NULL,
          password_updated_at TIMESTAMP(3) NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_passwords_sid FOREIGN KEY (sid_id) REFERENCES sids(id) ON DELETE CASCADE,
          CONSTRAINT fk_sid_passwords_updated_by FOREIGN KEY (password_updated_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`
      );
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_passwords');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_activity_log');
    } catch {
      // ignore
    }
  },
};
