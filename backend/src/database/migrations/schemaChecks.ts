import type { DatabaseAdapter } from '../adapters/base.js';

export async function tableExists(adapter: DatabaseAdapter, tableName: string): Promise<boolean> {
  const rows = await adapter.query(
    `SELECT TABLE_NAME AS name
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

export async function columnExists(
  adapter: DatabaseAdapter,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const rows = await adapter.query(
    `SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

export async function indexExists(adapter: DatabaseAdapter, indexName: string): Promise<boolean> {
  const rows = await adapter.query(
    `SELECT INDEX_NAME AS name
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ?
     LIMIT 1`,
    [indexName]
  );
  return rows.length > 0;
}
