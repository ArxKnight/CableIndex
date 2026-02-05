import type { DatabaseAdapter } from '../adapters/base.js';
import connection from '../connection.js';

export async function up(adapter: DatabaseAdapter) {
  const config = connection.getConfig();
  const isMySQL = config?.type === 'mysql';

  const query =
    typeof (adapter as any).query === 'function'
      ? ((adapter as any).query as (sql: string, params?: any[]) => Promise<any[]>).bind(adapter)
      : undefined;
  const columnExists = async (tableName: string, columnName: string): Promise<boolean> => {
    if (!query) return false;

    if (isMySQL) {
      const rows = await query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
      return rows.length > 0;
    }

    const rows = await query(`PRAGMA table_info(${tableName})`);
    return rows.some((r: any) => String(r.name) === columnName);
  };

  if (!(await columnExists('users', 'username'))) {
    await adapter.execute(
      isMySQL
        ? `ALTER TABLE users ADD COLUMN username VARCHAR(255)`
        : `ALTER TABLE users ADD COLUMN username TEXT`
    );
  }

  // Ensure legacy rows have a non-empty username.
  // We intentionally do not depend on any historical name columns.
  await adapter.execute(
    `UPDATE users
     SET username = email
     WHERE username IS NULL OR username = ''`
  );

  // Best-effort NOT NULL constraint on MySQL only.
  if (isMySQL) {
    await adapter.execute(`ALTER TABLE users MODIFY COLUMN username VARCHAR(255) NOT NULL`);
  }
}

export async function down(adapter: DatabaseAdapter) {
  // Best-effort rollback; DROP COLUMN support varies.
  try {
    await adapter.execute(`ALTER TABLE users DROP COLUMN username`);
  } catch (error) {
    // Ignore rollback failures for older SQLite versions.
    console.warn('Could not drop users.username during rollback:', error);
  }
}
