import { DatabaseAdapter } from '../adapters/base.js';

export async function up(adapter: DatabaseAdapter): Promise<void> {
  console.log('Running migration: 004_add_fullname_to_invitations');
  
  const getSQL = (sqliteQuery: string, mysqlQuery: string): string => {
    return adapter.constructor.name === 'SQLiteAdapter' ? sqliteQuery : mysqlQuery;
  };

  // Add full_name column to invitations table
  await adapter.execute(getSQL(
    `ALTER TABLE invitations ADD COLUMN full_name TEXT`,
    `ALTER TABLE invitations ADD COLUMN full_name VARCHAR(100)`
  ));
  
  console.log('Migration 004_add_fullname_to_invitations completed successfully');
}

export async function down(adapter: DatabaseAdapter): Promise<void> {
  console.log('Rolling back migration: 004_add_fullname_to_invitations');
  
  // Drop full_name column
  await adapter.execute(`ALTER TABLE invitations DROP COLUMN full_name`);
  
  console.log('Rollback 004_add_fullname_to_invitations completed');
}
