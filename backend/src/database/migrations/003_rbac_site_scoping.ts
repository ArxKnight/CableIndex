import type { Migration } from './index.js';
import { columnExists, indexExists, tableExists } from './schemaChecks.js';

export const Migration003_RbacSiteScoping: Migration = {
  id: '003',
  name: 'RBAC, site memberships, invitations, and label scoping',

  up: async (adapter) => {
    // If the schema is already at/after this migration's target, skip doing work.
    const schemaAlreadyHasRbac =
      (await tableExists(adapter, 'site_memberships')) &&
      (await columnExists(adapter, 'sites', 'code')) &&
      (await columnExists(adapter, 'sites', 'created_by')) &&
      (await columnExists(adapter, 'labels', 'ref_string')) &&
      (await columnExists(adapter, 'labels', 'created_by'));
    if (schemaAlreadyHasRbac) {
      console.log('ℹ️  RBAC/site scoping already present; skipping migration 003 body');
      return;
    }

    // Add new columns to sites
    if (!(await columnExists(adapter, 'sites', 'code'))) {
      await adapter.execute(`ALTER TABLE sites ADD COLUMN code VARCHAR(255)`);
    }

    if (!(await columnExists(adapter, 'sites', 'created_by'))) {
      await adapter.execute(`ALTER TABLE sites ADD COLUMN created_by INT`);
    }

    // Backfill created_by and code
    const sitesHasLegacyUserId = await columnExists(adapter, 'sites', 'user_id');
    if (sitesHasLegacyUserId) {
      await adapter.execute(`UPDATE sites SET created_by = COALESCE(created_by, user_id) WHERE created_by IS NULL`);
    }
    if (await columnExists(adapter, 'sites', 'code')) {
      await adapter.execute(`UPDATE sites SET code = COALESCE(code, name) WHERE code IS NULL`);
    }

    // Add unique index on code if not exists
    if (!(await indexExists(adapter, 'idx_sites_code_unique'))) {
      await adapter.execute('CREATE UNIQUE INDEX idx_sites_code_unique ON sites(code)');
    }

    // Create site_memberships table
    await adapter.execute(
      `CREATE TABLE IF NOT EXISTS site_memberships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        user_id INT NOT NULL,
        site_role VARCHAR(50) NOT NULL,
        CONSTRAINT fk_site_memberships_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CONSTRAINT fk_site_memberships_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_site_user (site_id, user_id)
      ) ENGINE=InnoDB`
    );

    if (!(await indexExists(adapter, 'idx_site_memberships_site_id'))) {
      await adapter.execute('CREATE INDEX idx_site_memberships_site_id ON site_memberships(site_id)');
    }

    if (!(await indexExists(adapter, 'idx_site_memberships_user_id'))) {
      await adapter.execute('CREATE INDEX idx_site_memberships_user_id ON site_memberships(user_id)');
    }

    // Backfill memberships for site creators
    try {
      await adapter.execute(
        `INSERT INTO site_memberships (site_id, user_id, site_role)
         SELECT s.id, s.created_by, 'ADMIN'
         FROM sites s
         WHERE s.created_by IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM site_memberships sm WHERE sm.site_id = s.id AND sm.user_id = s.created_by
         )`
      );
    } catch (error) {
      // Ignore if backfill fails
    }

    // Create invitations tables
    await adapter.execute(
      `CREATE TABLE IF NOT EXISTS invitations (
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

    await adapter.execute(
      `CREATE TABLE IF NOT EXISTS invitation_sites (
        invitation_id INT NOT NULL,
        site_id INT NOT NULL,
        site_role VARCHAR(50) NOT NULL,
        CONSTRAINT fk_invitation_sites_invitation_id FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
        CONSTRAINT fk_invitation_sites_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`
    );

    // Create site counters
    await adapter.execute(
      `CREATE TABLE IF NOT EXISTS site_counters (
        site_id INT PRIMARY KEY,
        next_ref INT NOT NULL,
        CONSTRAINT fk_site_counters_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`
    );

    // Backfill site_counters
    try {
      await adapter.execute(
        `INSERT INTO site_counters (site_id, next_ref)
         SELECT s.id, 1 FROM sites s
         ON DUPLICATE KEY UPDATE next_ref = next_ref`
      );
    } catch (error) {
      // Ignore if inserts fail (counters may already exist)
    }

    // Add new columns to labels
    if (!(await columnExists(adapter, 'labels', 'ref_number'))) {
      await adapter.execute(`ALTER TABLE labels ADD COLUMN ref_number INT`);
    }

    if (!(await columnExists(adapter, 'labels', 'ref_string'))) {
      await adapter.execute(`ALTER TABLE labels ADD COLUMN ref_string VARCHAR(255)`);
    }

    if (!(await columnExists(adapter, 'labels', 'type'))) {
      await adapter.execute(`ALTER TABLE labels ADD COLUMN type VARCHAR(100)`);
    }

    if (!(await columnExists(adapter, 'labels', 'payload_json'))) {
      await adapter.execute(`ALTER TABLE labels ADD COLUMN payload_json TEXT`);
    }

    if (!(await columnExists(adapter, 'labels', 'created_by'))) {
      await adapter.execute(`ALTER TABLE labels ADD COLUMN created_by INT`);
    }

    // Backfill label fields
    const labelsHasLegacyUserId = await columnExists(adapter, 'labels', 'user_id');
    if (labelsHasLegacyUserId) {
      await adapter.execute(`UPDATE labels SET created_by = COALESCE(created_by, user_id) WHERE created_by IS NULL`);
    }

    if (await columnExists(adapter, 'labels', 'type')) {
      await adapter.execute(`UPDATE labels SET type = COALESCE(type, 'cable') WHERE type IS NULL`);
    }

    // Backfill ref_string and ref_number from legacy reference_number if available
    const labelsHasLegacyReferenceNumber = await columnExists(adapter, 'labels', 'reference_number');
    if (labelsHasLegacyReferenceNumber) {
      await adapter.execute(`UPDATE labels SET ref_string = COALESCE(ref_string, reference_number) WHERE ref_string IS NULL`);
    }

    try {
      await adapter.execute(
        `UPDATE labels
         SET ref_number = COALESCE(ref_number,
           CAST(SUBSTRING(ref_string, LOCATE('-', ref_string) + 1) AS UNSIGNED)
         )
         WHERE ref_number IS NULL AND ref_string IS NOT NULL`
      );
    } catch (error) {
      // Parsing might fail; fallback below
    }

    if (await columnExists(adapter, 'labels', 'ref_number')) {
      await adapter.execute(`UPDATE labels SET ref_number = COALESCE(ref_number, 1) WHERE ref_number IS NULL`);
    }

    // Add indexes for labels
    if (!(await indexExists(adapter, 'idx_labels_ref_string'))) {
      await adapter.execute('CREATE INDEX idx_labels_ref_string ON labels(ref_string)');
    }

    if (!(await indexExists(adapter, 'idx_labels_created_by'))) {
      await adapter.execute('CREATE INDEX idx_labels_created_by ON labels(created_by)');
    }
  },

  down: async () => {
    console.log('⚠️  RBAC migration rollback not supported');
  }
};
