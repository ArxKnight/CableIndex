import type { DatabaseAdapter } from '../adapters/base.js';

export const Migration026_SidStatusPicklist = {
  id: '026',
  name: 'sid_status_picklist',

  up: async (adapter: DatabaseAdapter) => {
    // Site-scoped status picklist for SIDs.
    await adapter.execute(
      `CREATE TABLE IF NOT EXISTS sid_statuses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_sid_statuses_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        UNIQUE KEY unique_site_sid_status_name (site_id, name)
      ) ENGINE=InnoDB`
    );

    // Seed from existing sids.status values so legacy values remain selectable.
    // Best-effort; ignore errors if table/column doesn't exist in some dev states.
    try {
      await adapter.execute(
        `INSERT IGNORE INTO sid_statuses (site_id, name, description)
         SELECT DISTINCT s.site_id, TRIM(s.status) as name, NULL as description
         FROM sids s
         WHERE s.status IS NOT NULL AND TRIM(s.status) <> ''`
      );
    } catch {
      // ignore
    }

    console.log('✅ Migration 026 applied: sid_status_picklist');
  },

  down: async (adapter: DatabaseAdapter) => {
    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_statuses');
    } catch {
      // ignore
    }

    console.log('✅ Migration 026 rolled back: sid_status_picklist');
  },
};
