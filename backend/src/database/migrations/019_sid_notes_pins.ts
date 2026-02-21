import type { DatabaseAdapter } from '../adapters/base.js';

export const Migration019_SidNotesPins = {
  id: '019',
  name: 'sid_notes_pins',

  up: async (adapter: DatabaseAdapter) => {
    await adapter.execute(
      `ALTER TABLE sid_notes
       ADD COLUMN pinned TINYINT(1) NOT NULL DEFAULT 0,
       ADD COLUMN pinned_at TIMESTAMP(3) NULL,
       ADD COLUMN pinned_by INT NULL`
    );

    await adapter.execute(
      `CREATE INDEX idx_sid_notes_sid_pinned
       ON sid_notes(sid_id, pinned, pinned_at, created_at)`
    );

    console.log('✅ Migration 019 applied: sid_notes pinning');
  },

  down: async (adapter: DatabaseAdapter) => {
    await adapter.execute('DROP INDEX idx_sid_notes_sid_pinned ON sid_notes');
    await adapter.execute(
      `ALTER TABLE sid_notes
       DROP COLUMN pinned,
       DROP COLUMN pinned_at,
       DROP COLUMN pinned_by`
    );

    console.log('✅ Migration 019 rolled back: sid_notes pinning');
  },
};
