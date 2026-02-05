import type { Migration } from './index.js';
import connection from '../connection.js';
import { columnExists, indexExists, tableExists } from './schemaChecks.js';

export const Migration003_RbacSiteScoping: Migration = {
  id: '003',
  name: 'RBAC, site memberships, invitations, and label scoping',

  up: async (adapter) => {
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    const dbType = config?.type || 'sqlite';
    const getSQL = (sqlite: string, mysql: string) => isMySQL ? mysql : sqlite;

    // If the schema is already at/after this migration's target, skip doing work.
    const schemaAlreadyHasRbac =
      (await tableExists(adapter, 'site_memberships', dbType)) &&
      (await columnExists(adapter, 'sites', 'code', dbType)) &&
      (await columnExists(adapter, 'sites', 'created_by', dbType)) &&
      (await columnExists(adapter, 'labels', 'ref_string', dbType)) &&
      (await columnExists(adapter, 'labels', 'created_by', dbType));
    if (schemaAlreadyHasRbac) {
      console.log('ℹ️  RBAC/site scoping already present; skipping migration 003 body');
      return;
    }

    // Add new columns to sites
    if (!(await columnExists(adapter, 'sites', 'code', dbType))) {
      await adapter.execute(getSQL(
        `ALTER TABLE sites ADD COLUMN code TEXT`,
        `ALTER TABLE sites ADD COLUMN code VARCHAR(255)`
      ));
    }

    if (!(await columnExists(adapter, 'sites', 'created_by', dbType))) {
      await adapter.execute(getSQL(
        `ALTER TABLE sites ADD COLUMN created_by INTEGER`,
        `ALTER TABLE sites ADD COLUMN created_by INT`
      ));
    }

    // Backfill created_by and code
    const sitesHasLegacyUserId = await columnExists(adapter, 'sites', 'user_id', dbType);
    if (sitesHasLegacyUserId) {
      await adapter.execute(`UPDATE sites SET created_by = COALESCE(created_by, user_id) WHERE created_by IS NULL`);
    }
    if (await columnExists(adapter, 'sites', 'code', dbType)) {
      await adapter.execute(`UPDATE sites SET code = COALESCE(code, name) WHERE code IS NULL`);
    }

    // Add unique index on code if not exists
    if (!(await indexExists(adapter, 'idx_sites_code_unique', dbType))) {
      await adapter.execute(getSQL(
        'CREATE UNIQUE INDEX idx_sites_code_unique ON sites(code)',
        'CREATE UNIQUE INDEX idx_sites_code_unique ON sites(code)'
      ));
    }

    // Create site_memberships table
    await adapter.execute(getSQL(
      `CREATE TABLE IF NOT EXISTS site_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        site_role TEXT NOT NULL CHECK (site_role IN ('ADMIN', 'USER')),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(site_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS site_memberships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        user_id INT NOT NULL,
        site_role VARCHAR(50) NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_site_user (site_id, user_id),
        CHECK (site_role IN ('ADMIN', 'USER'))
      )`
    ));

    if (!(await indexExists(adapter, 'idx_site_memberships_site_id', dbType))) {
      await adapter.execute(getSQL(
        'CREATE INDEX idx_site_memberships_site_id ON site_memberships(site_id)',
        'CREATE INDEX idx_site_memberships_site_id ON site_memberships(site_id)'
      ));
    }

    if (!(await indexExists(adapter, 'idx_site_memberships_user_id', dbType))) {
      await adapter.execute(getSQL(
        'CREATE INDEX idx_site_memberships_user_id ON site_memberships(user_id)',
        'CREATE INDEX idx_site_memberships_user_id ON site_memberships(user_id)'
      ));
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
    await adapter.execute(getSQL(
      `CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        invited_by INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS invitations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        invited_by INT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
      )`
    ));

    await adapter.execute(getSQL(
      `CREATE TABLE IF NOT EXISTS invitation_sites (
        invitation_id INTEGER NOT NULL,
        site_id INTEGER NOT NULL,
        site_role TEXT NOT NULL CHECK (site_role IN ('ADMIN', 'USER')),
        FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS invitation_sites (
        invitation_id INT NOT NULL,
        site_id INT NOT NULL,
        site_role VARCHAR(50) NOT NULL,
        FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CHECK (site_role IN ('ADMIN', 'USER'))
      )`
    ));

    // Create site counters
    await adapter.execute(getSQL(
      `CREATE TABLE IF NOT EXISTS site_counters (
        site_id INTEGER PRIMARY KEY,
        next_ref INTEGER NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS site_counters (
        site_id INT PRIMARY KEY,
        next_ref INT NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      )`
    ));

    // Backfill site_counters
    try {
      if (isMySQL) {
        await adapter.execute(
          `INSERT INTO site_counters (site_id, next_ref)
           SELECT s.id, 1 FROM sites s
           ON DUPLICATE KEY UPDATE next_ref = next_ref`
        );
      } else {
        await adapter.execute(
          `INSERT OR IGNORE INTO site_counters (site_id, next_ref)
           SELECT s.id, 1 FROM sites s`
        );
      }
    } catch (error) {
      // Ignore if inserts fail (counters may already exist)
    }

    // Add new columns to labels
    if (!(await columnExists(adapter, 'labels', 'ref_number', dbType))) {
      await adapter.execute(getSQL(
        `ALTER TABLE labels ADD COLUMN ref_number INTEGER`,
        `ALTER TABLE labels ADD COLUMN ref_number INT`
      ));
    }

    if (!(await columnExists(adapter, 'labels', 'ref_string', dbType))) {
      await adapter.execute(getSQL(
        `ALTER TABLE labels ADD COLUMN ref_string TEXT`,
        `ALTER TABLE labels ADD COLUMN ref_string VARCHAR(255)`
      ));
    }

    if (!(await columnExists(adapter, 'labels', 'type', dbType))) {
      await adapter.execute(getSQL(
        `ALTER TABLE labels ADD COLUMN type TEXT`,
        `ALTER TABLE labels ADD COLUMN type VARCHAR(100)`
      ));
    }

    if (!(await columnExists(adapter, 'labels', 'payload_json', dbType))) {
      await adapter.execute(getSQL(
        `ALTER TABLE labels ADD COLUMN payload_json TEXT`,
        `ALTER TABLE labels ADD COLUMN payload_json TEXT`
      ));
    }

    if (!(await columnExists(adapter, 'labels', 'created_by', dbType))) {
      await adapter.execute(getSQL(
        `ALTER TABLE labels ADD COLUMN created_by INTEGER`,
        `ALTER TABLE labels ADD COLUMN created_by INT`
      ));
    }

    // Backfill label fields
    const labelsHasLegacyUserId = await columnExists(adapter, 'labels', 'user_id', dbType);
    if (labelsHasLegacyUserId) {
      await adapter.execute(`UPDATE labels SET created_by = COALESCE(created_by, user_id) WHERE created_by IS NULL`);
    }

    if (await columnExists(adapter, 'labels', 'type', dbType)) {
      await adapter.execute(`UPDATE labels SET type = COALESCE(type, 'cable') WHERE type IS NULL`);
    }

    // Backfill ref_string and ref_number from legacy reference_number if available
    const labelsHasLegacyReferenceNumber = await columnExists(adapter, 'labels', 'reference_number', dbType);
    if (labelsHasLegacyReferenceNumber) {
      await adapter.execute(`UPDATE labels SET ref_string = COALESCE(ref_string, reference_number) WHERE ref_string IS NULL`);
    }

    try {
      await adapter.execute(getSQL(
        `UPDATE labels
         SET ref_number = COALESCE(ref_number,
           CAST(SUBSTR(ref_string, INSTR(ref_string, '-') + 1) AS INTEGER)
         )
         WHERE ref_number IS NULL AND ref_string IS NOT NULL`,
        `UPDATE labels
         SET ref_number = COALESCE(ref_number,
           CAST(SUBSTRING(ref_string, LOCATE('-', ref_string) + 1) AS UNSIGNED)
         )
         WHERE ref_number IS NULL AND ref_string IS NOT NULL`
      ));
    } catch (error) {
      // Parsing might fail; fallback below
    }

    if (await columnExists(adapter, 'labels', 'ref_number', dbType)) {
      await adapter.execute(`UPDATE labels SET ref_number = COALESCE(ref_number, 1) WHERE ref_number IS NULL`);
    }

    // Add indexes for labels
    if (!(await indexExists(adapter, 'idx_labels_ref_string', dbType))) {
      await adapter.execute(getSQL(
        'CREATE INDEX idx_labels_ref_string ON labels(ref_string)',
        'CREATE INDEX idx_labels_ref_string ON labels(ref_string)'
      ));
    }

    if (!(await indexExists(adapter, 'idx_labels_created_by', dbType))) {
      await adapter.execute(getSQL(
        'CREATE INDEX idx_labels_created_by ON labels(created_by)',
        'CREATE INDEX idx_labels_created_by ON labels(created_by)'
      ));
    }
  },

  down: async () => {
    console.log('⚠️  RBAC migration rollback not supported');
  }
};
