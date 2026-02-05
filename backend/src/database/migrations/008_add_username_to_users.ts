import type { DatabaseAdapter } from '../adapters/base.js';
import { columnExists as columnExistsHelper } from './schemaChecks.js';

export async function up(adapter: DatabaseAdapter) {
  if (!(await columnExistsHelper(adapter, 'users', 'username'))) {
    await adapter.execute(`ALTER TABLE users ADD COLUMN username VARCHAR(255)`);
  }

  // Ensure legacy rows have a non-empty username.
  // We intentionally do not depend on any historical name columns.
  await adapter.execute(
    `UPDATE users
     SET username = email
     WHERE username IS NULL OR username = ''`
  );

  // Best-effort NOT NULL constraint.
  await adapter.execute(`ALTER TABLE users MODIFY COLUMN username VARCHAR(255) NOT NULL`);
}

export async function down(adapter: DatabaseAdapter) {
  // Best-effort rollback; DROP COLUMN support varies.
  try {
    await adapter.execute(`ALTER TABLE users DROP COLUMN username`);
  } catch (error) {
    console.warn('Could not drop users.username during rollback:', error);
  }
}
