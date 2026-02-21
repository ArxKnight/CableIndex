import type { DatabaseAdapter } from '../adapters/base.js';

export const Migration018_SiteCountersNextSid = {
  id: '018',
  name: 'site_counters_next_sid',

  up: async (adapter: DatabaseAdapter) => {
    // Add a site-scoped SID counter, similar to CableIndex's next_ref.
    await adapter.execute(
      `ALTER TABLE site_counters
       ADD COLUMN next_sid INT NOT NULL DEFAULT 1`
    );

    // Backfill from existing SIDs (numeric-only sid_number rows).
    // If there are no SIDs, next_sid should be 1.
    await adapter.execute(
      `UPDATE site_counters sc
       SET sc.next_sid = (
         SELECT COALESCE(MAX(CAST(s.sid_number AS UNSIGNED)), 0) + 1
         FROM sids s
         WHERE s.site_id = sc.site_id
           AND s.sid_number REGEXP '^[0-9]+$'
       )`
    );

    console.log('✅ Migration 018 applied: site_counters.next_sid');
  },

  down: async (adapter: DatabaseAdapter) => {
    await adapter.execute(
      `ALTER TABLE site_counters
       DROP COLUMN next_sid`
    );
    console.log('✅ Migration 018 rolled back: site_counters.next_sid');
  },
};
