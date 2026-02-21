import type { Migration } from './index.js';

export const Migration025_SidRemoveAssetTagSystemNotes: Migration = {
  id: '025',
  name: 'sid_remove_asset_tag_system_notes',

  up: async (adapter) => {
    // Remove unused SID field
    try {
      await adapter.execute('ALTER TABLE sids DROP COLUMN asset_tag');
    } catch {
      // ignore
    }

    // Allow system-authored notes by permitting created_by to be NULL
    try {
      await adapter.execute('ALTER TABLE sid_notes DROP FOREIGN KEY fk_sid_notes_created_by');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sid_notes MODIFY COLUMN created_by INT NULL');
    } catch {
      // ignore
    }

    try {
      await adapter.execute(
        'ALTER TABLE sid_notes ADD CONSTRAINT fk_sid_notes_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL'
      );
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
    // Best-effort revert
    try {
      await adapter.execute('ALTER TABLE sid_notes DROP FOREIGN KEY fk_sid_notes_created_by');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sid_notes MODIFY COLUMN created_by INT NOT NULL');
    } catch {
      // ignore
    }

    try {
      await adapter.execute(
        'ALTER TABLE sid_notes ADD CONSTRAINT fk_sid_notes_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT'
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute('ALTER TABLE sids ADD COLUMN asset_tag VARCHAR(255) NULL');
    } catch {
      // ignore
    }
  },
};
