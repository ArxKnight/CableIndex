import type { Migration } from './index.js';

export const Migration021_SidRackU: Migration = {
  id: '021',
  name: 'sid_rack_u',

  up: async (adapter) => {
    try {
      await adapter.execute('ALTER TABLE sids ADD COLUMN rack_u INT NULL');
    } catch {
      // ignore (column may already exist)
    }

    try {
      await adapter.execute('CREATE INDEX idx_sids_rack_u ON sids(rack_u)');
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
    try {
      await adapter.execute('DROP INDEX idx_sids_rack_u ON sids');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sids DROP COLUMN rack_u');
    } catch {
      // ignore
    }
  },
};
