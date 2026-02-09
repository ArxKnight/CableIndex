import type { Migration } from './index.js';

// Allow multiple locations to share the same coordinates as long as their label differs.
// We treat NULL/blank label as a special "unlabeled" bucket so only one unlabeled
// location can exist per coordinate set.
//
// Implementation: add a generated STORED column `label_key` and make uniqueness
// (site_id, floor, suite, row, rack, label_key).
export const Migration011_SiteLocationLabelKeyUnique: Migration = {
  id: '011',
  name: 'site_location_label_key_unique',

  up: async (adapter) => {
    // Drop previous uniqueness that prevented same coords with different labels.
    try {
      await adapter.execute('DROP INDEX idx_site_locations_unique_coords ON site_locations');
    } catch {
      // ignore
    }

    // Add generated label_key column (best-effort for existing installs).
    // label_key normalizes blank/NULL to a fixed token so uniqueness works as expected.
    try {
      await adapter.execute(
        `ALTER TABLE site_locations
         ADD COLUMN label_key VARCHAR(255)
         GENERATED ALWAYS AS (IFNULL(NULLIF(TRIM(label), ''), '__UNLABELED__')) STORED`
      );
    } catch {
      // ignore
    }

    // Enforce uniqueness by coords + label_key.
    try {
      await adapter.execute(
        'CREATE UNIQUE INDEX idx_site_locations_unique_coords_label ON site_locations(site_id, floor, suite, `row`, rack, label_key)'
      );
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
    try {
      await adapter.execute('DROP INDEX idx_site_locations_unique_coords_label ON site_locations');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE site_locations DROP COLUMN label_key');
    } catch {
      // ignore
    }

    // Restore previous uniqueness rule.
    try {
      await adapter.execute(
        'CREATE UNIQUE INDEX idx_site_locations_unique_coords ON site_locations(site_id, floor, suite, `row`, rack)'
      );
    } catch {
      // ignore
    }
  },
};
