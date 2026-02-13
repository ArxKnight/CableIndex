import type { Migration } from './index.js';

// Extend site_locations to support multiple location templates:
// - DATACENTRE: floor + suite + row + rack (required in app), area must be NULL
// - DOMESTIC: floor + area (required in app), suite/row/rack must be NULL
//
// Notes:
// - We keep backwards compatibility by defaulting template_type to DATACENTRE.
// - We relax suite/row/rack columns to allow NULL for DOMESTIC locations.
// - We update the uniqueness strategy to work across both templates.
export const Migration012_LocationTemplates: Migration = {
  id: '012',
  name: 'site_location_templates',

  up: async (adapter) => {
    // Add new columns (best-effort for existing installs).
    try {
      await adapter.execute(
        "ALTER TABLE site_locations ADD COLUMN template_type ENUM('DATACENTRE','DOMESTIC') NOT NULL DEFAULT 'DATACENTRE'"
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE site_locations ADD COLUMN area VARCHAR(64) NULL');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE site_locations ADD COLUMN name VARCHAR(255) NULL');
    } catch {
      // ignore
    }

    // Allow NULL for suite/row/rack so DOMESTIC rows can exist.
    // Keep sizes consistent with original schema.
    try {
      await adapter.execute('ALTER TABLE site_locations MODIFY suite VARCHAR(50) NULL');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE site_locations MODIFY `row` VARCHAR(50) NULL');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE site_locations MODIFY rack VARCHAR(50) NULL');
    } catch {
      // ignore
    }

    // Backfill existing rows to DATACENTRE explicitly (safe even with default).
    try {
      await adapter.execute("UPDATE site_locations SET template_type = 'DATACENTRE' WHERE template_type IS NULL");
    } catch {
      // ignore
    }

    // Drop the previous uniqueness index so we can replace it with a template-aware one.
    try {
      await adapter.execute('DROP INDEX idx_site_locations_unique_coords_label ON site_locations');
    } catch {
      // ignore
    }

    // Add generated keys to normalize NULL/blank values so uniqueness works as expected.
    // (MySQL treats NULLs in UNIQUE indexes specially; normalization avoids duplicates.)
    try {
      await adapter.execute(
        `ALTER TABLE site_locations
         ADD COLUMN suite_key VARCHAR(50)
         GENERATED ALWAYS AS (IFNULL(NULLIF(TRIM(suite), ''), '__NONE__')) STORED`
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute(
        `ALTER TABLE site_locations
         ADD COLUMN row_key VARCHAR(50)
         GENERATED ALWAYS AS (IFNULL(NULLIF(TRIM(\`row\`), ''), '__NONE__')) STORED`
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute(
        `ALTER TABLE site_locations
         ADD COLUMN rack_key VARCHAR(50)
         GENERATED ALWAYS AS (IFNULL(NULLIF(TRIM(rack), ''), '__NONE__')) STORED`
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute(
        `ALTER TABLE site_locations
         ADD COLUMN area_key VARCHAR(64)
         GENERATED ALWAYS AS (IFNULL(NULLIF(TRIM(area), ''), '__NONE__')) STORED`
      );
    } catch {
      // ignore
    }

    // Ensure site_id is indexed.
    try {
      const rows = await adapter.query(
        `SELECT 1
         FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name = 'site_locations'
           AND index_name = 'idx_site_locations_site_id'
         LIMIT 1`
      );
      if (!rows || rows.length === 0) {
        await adapter.execute('CREATE INDEX idx_site_locations_site_id ON site_locations(site_id)');
      }
    } catch {
      // ignore
    }

    // Template-aware uniqueness: prevent exact duplicates within a site.
    // We include label_key so labeled/unlabeled buckets remain distinct.
    try {
      await adapter.execute(
        'CREATE UNIQUE INDEX idx_site_locations_unique_identity ON site_locations(site_id, template_type, floor, suite_key, row_key, rack_key, area_key, label_key)'
      );
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
    try {
      await adapter.execute('DROP INDEX idx_site_locations_unique_identity ON site_locations');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE site_locations DROP COLUMN area_key');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('ALTER TABLE site_locations DROP COLUMN rack_key');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('ALTER TABLE site_locations DROP COLUMN row_key');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('ALTER TABLE site_locations DROP COLUMN suite_key');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE site_locations DROP COLUMN name');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('ALTER TABLE site_locations DROP COLUMN area');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('ALTER TABLE site_locations DROP COLUMN template_type');
    } catch {
      // ignore
    }

    // Best-effort restore of the previous uniqueness rule.
    try {
      await adapter.execute(
        'CREATE UNIQUE INDEX idx_site_locations_unique_coords_label ON site_locations(site_id, floor, suite, `row`, rack, label_key)'
      );
    } catch {
      // ignore
    }
  },
};
