import type { Migration } from './index.js';

export const Migration009_NormalizeSiteLocationLabels: Migration = {
  id: '009',
  name: 'normalize_site_location_labels',

  up: async (adapter) => {
    // Backfill missing/blank site_locations.label with the parent site's code.
    // This ensures the "effective label" is never blank.
    await adapter.execute(`
      UPDATE site_locations sl
      JOIN sites s ON s.id = sl.site_id
      SET sl.label = s.code
      WHERE sl.label IS NULL OR TRIM(sl.label) = ''
    `);
  },

  down: async (_adapter) => {
    // No-op: we can't reliably distinguish backfilled labels from user-provided labels.
  },
};
