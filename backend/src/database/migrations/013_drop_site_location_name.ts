import type { Migration } from './index.js';

// Follow-up cleanup: remove the deprecated `site_locations.name` column.
// The application no longer reads/writes this field.
export const Migration013_DropSiteLocationName: Migration = {
  id: '013',
  name: 'drop_site_location_name',

  up: async (adapter) => {
    // Best-effort: ignore if column does not exist.
    try {
      await adapter.execute('ALTER TABLE site_locations DROP COLUMN name');
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
    // Best-effort restore.
    try {
      await adapter.execute('ALTER TABLE site_locations ADD COLUMN name VARCHAR(255) NULL');
    } catch {
      // ignore
    }
  },
};
