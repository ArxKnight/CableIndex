import type { Migration } from './index.js';

export const Migration024_SidRackUStringRamDecimal: Migration = {
  id: '024',
  name: 'sid_racku_string_ram_decimal',

  up: async (adapter) => {
    // Allow alphanumeric rack positions like "12a" or "4b"
    try {
      await adapter.execute('ALTER TABLE sids MODIFY COLUMN rack_u VARCHAR(16) NULL');
    } catch {
      // ignore
    }

    // Allow fractional RAM amounts like 0.5 GB
    try {
      await adapter.execute('ALTER TABLE sids MODIFY COLUMN ram_gb DECIMAL(10,3) NULL');
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
    // Best-effort revert (may lose data)
    try {
      await adapter.execute('ALTER TABLE sids MODIFY COLUMN ram_gb INT NULL');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sids MODIFY COLUMN rack_u INT NULL');
    } catch {
      // ignore
    }
  },
};
