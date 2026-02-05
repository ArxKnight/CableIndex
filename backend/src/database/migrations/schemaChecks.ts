import type { DatabaseAdapter } from '../adapters/base.js';

export type DbType = 'sqlite' | 'mysql' | string;

export async function tableExists(adapter: DatabaseAdapter, tableName: string, dbType: DbType): Promise<boolean> {
  if (dbType === 'mysql') {
    const rows = await adapter.query(
      `SELECT TABLE_NAME AS name
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       LIMIT 1`,
      [tableName]
    );
    return rows.length > 0;
  }

  const rows = await adapter.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

export async function columnExists(
  adapter: DatabaseAdapter,
  tableName: string,
  columnName: string,
  dbType: DbType
): Promise<boolean> {
  if (dbType === 'mysql') {
    const rows = await adapter.query(
      `SELECT COLUMN_NAME AS name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       LIMIT 1`,
      [tableName, columnName]
    );
    return rows.length > 0;
  }

  const pragmaRows = await adapter.query(`PRAGMA table_info(${tableName})`);
  return pragmaRows.some((r: any) => r?.name === columnName);
}

export async function indexExists(adapter: DatabaseAdapter, indexName: string, dbType: DbType): Promise<boolean> {
  if (dbType === 'mysql') {
    const rows = await adapter.query(
      `SELECT INDEX_NAME AS name
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ?
       LIMIT 1`,
      [indexName]
    );
    return rows.length > 0;
  }

  const rows = await adapter.query(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1`,
    [indexName]
  );
  return rows.length > 0;
}
