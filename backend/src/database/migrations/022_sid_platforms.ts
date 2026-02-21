import type { Migration } from './index.js';

export const Migration022_SidPlatforms: Migration = {
  id: '022',
  name: 'sid_platforms',

  up: async (adapter) => {
    try {
      await adapter.execute(
        `CREATE TABLE sid_platforms (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_platforms_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          UNIQUE KEY unique_site_platform_name (site_id, name)
        ) ENGINE=InnoDB`
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sids ADD COLUMN platform_id INT NULL');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('CREATE INDEX idx_sids_platform_id ON sids(platform_id)');
    } catch {
      // ignore
    }

    try {
      await adapter.execute(
        'ALTER TABLE sids ADD CONSTRAINT fk_sids_platform_id FOREIGN KEY (platform_id) REFERENCES sid_platforms(id) ON DELETE SET NULL'
      );
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
    try {
      await adapter.execute('ALTER TABLE sids DROP FOREIGN KEY fk_sids_platform_id');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('DROP INDEX idx_sids_platform_id ON sids');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sids DROP COLUMN platform_id');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_platforms');
    } catch {
      // ignore
    }
  },
};
