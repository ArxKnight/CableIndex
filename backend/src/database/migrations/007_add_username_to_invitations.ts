import type { DatabaseAdapter } from '../adapters/base.js';
import { columnExists as columnExistsHelper } from './schemaChecks.js';

export const up = async (adapter: DatabaseAdapter): Promise<void> => {
  console.log('Running migration: 007_add_username_to_invitations');

  // Add username column
  if (!(await columnExistsHelper(adapter, 'invitations', 'username'))) {
    await adapter.execute(`ALTER TABLE invitations ADD COLUMN username VARCHAR(100)`);
  }

  // Ensure legacy rows have a non-empty username.
  // We intentionally do not depend on any historical name columns.
  await adapter.execute(
    `UPDATE invitations
     SET username = email
     WHERE username IS NULL OR username = ''`
  );

  console.log('Migration 007_add_username_to_invitations completed successfully');
};

export const down = async (adapter: DatabaseAdapter): Promise<void> => {
  console.log('Rolling back migration: 007_add_username_to_invitations');
  try {
    await adapter.execute(`ALTER TABLE invitations DROP COLUMN username`);
  } catch {
    // Best-effort rollback.
  }
  console.log('Rollback 007_add_username_to_invitations completed');
};
