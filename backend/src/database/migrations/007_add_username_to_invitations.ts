import type { DatabaseAdapter } from '../adapters/base.js';
import connection from '../connection.js';

export const up = async (adapter: DatabaseAdapter): Promise<void> => {
  console.log('Running migration: 007_add_username_to_invitations');

  const config = connection.getConfig();
  const isMySQL = config?.type === 'mysql';

  const columnExists = async (tableName: string, columnName: string): Promise<boolean> => {
    if (isMySQL) {
      const rows = await adapter.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
      return rows.length > 0;
    }

    const rows = await adapter.query(`PRAGMA table_info(${tableName})`);
    return rows.some((r: any) => String(r.name) === columnName);
  };

  // Add username column
  if (!(await columnExists('invitations', 'username'))) {
    await adapter.execute(
      isMySQL
        ? `ALTER TABLE invitations ADD COLUMN username VARCHAR(100)`
        : `ALTER TABLE invitations ADD COLUMN username TEXT`
    );
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
    // Ignore rollback failures for older SQLite versions.
  }
  console.log('Rollback 007_add_username_to_invitations completed');
};
