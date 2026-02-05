import connection from '../connection.js';
import { DatabaseAdapter } from '../adapters/base.js';
import { Migration001_InitialSchema } from './001_initial_schema.js';
import { Migration002_AddRoleToUsers } from './002_add_role_to_users.js';
import { Migration003_RbacSiteScoping } from './003_rbac_site_scoping.js';
import * as migration004 from './004_add_fullname_to_invitations.js';
import { Migration005_SiteLocations } from './005_site_locations.js';
import { Migration006_CableTypes } from './006_cable_types.js';
import * as migration007 from './007_add_username_to_invitations.js';
import * as migration008 from './008_add_username_to_users.js';

export interface Migration {
  id: string;
  name: string;
  up: (adapter: DatabaseAdapter) => Promise<void>;
  down: (adapter: DatabaseAdapter) => Promise<void>;
}

const Migration004_AddFullnameToInvitations: Migration = {
  id: '004',
  name: 'add_fullname_to_invitations',
  up: migration004.up,
  down: migration004.down,
};

const Migration007_AddUsernameToInvitations: Migration = {
  id: '007',
  name: 'add_username_to_invitations',
  up: migration007.up,
  down: migration007.down,
};

const Migration008_AddUsernameToUsers: Migration = {
  id: '008',
  name: 'add_username_to_users',
  up: migration008.up,
  down: migration008.down,
};

// List of all migrations in order
const migrations: Migration[] = [
  Migration001_InitialSchema,
  Migration002_AddRoleToUsers,
  Migration003_RbacSiteScoping,
  Migration004_AddFullnameToInvitations,
  Migration005_SiteLocations,
  Migration006_CableTypes,
  Migration007_AddUsernameToInvitations,
  Migration008_AddUsernameToUsers,
];

export async function runMigrations(): Promise<void> {
  const adapter = connection.getAdapter();
  
  try {
    // Create migrations table if it doesn't exist
    const createMigrationsTable = `CREATE TABLE IF NOT EXISTS migrations (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3)
    )`;
    
    await adapter.execute(createMigrationsTable);
    
    // Get applied migrations
    const appliedMigrations = await adapter.query('SELECT id FROM migrations');
    const appliedIds = new Set(appliedMigrations.map((m: any) => m.id));
    
    // Run pending migrations
    for (const migration of migrations) {
      if (!appliedIds.has(migration.id)) {
        console.log(`🔄 Running migration: ${migration.name}`);
        
        // Begin transaction for migration
        await adapter.beginTransaction();
        
        try {
          // Run migration
          await migration.up(adapter);
          
          // Record migration as applied
          await adapter.execute('INSERT INTO migrations (id, name) VALUES (?, ?)', [migration.id, migration.name]);
          
          await adapter.commit();
          console.log(`✅ Migration completed: ${migration.name}`);
        } catch (error) {
          await adapter.rollback();
          throw error;
        }
      }
    }
    
    console.log('✅ All migrations completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function rollbackMigration(migrationId: string): Promise<void> {
  const adapter = connection.getAdapter();
  
  try {
    // Find migration
    const migration = migrations.find(m => m.id === migrationId);
    if (!migration) {
      throw new Error(`Migration not found: ${migrationId}`);
    }
    
    // Check if migration is applied
    const applied = await adapter.query('SELECT id FROM migrations WHERE id = ?', [migrationId]);
    if (applied.length === 0) {
      throw new Error(`Migration not applied: ${migrationId}`);
    }
    
    console.log(`🔄 Rolling back migration: ${migration.name}`);
    
    // Begin transaction for rollback
    await adapter.beginTransaction();
    
    try {
      // Run rollback
      await migration.down(adapter);
      
      // Remove migration record
      await adapter.execute('DELETE FROM migrations WHERE id = ?', [migrationId]);
      
      await adapter.commit();
      console.log(`✅ Migration rolled back: ${migration.name}`);
    } catch (error) {
      await adapter.rollback();
      throw error;
    }
  } catch (error) {
    console.error('❌ Migration rollback failed:', error);
    throw error;
  }
}

export async function getMigrationStatus(): Promise<Array<{ id: string; name: string; applied: boolean; appliedAt?: string }>> {
  const adapter = connection.getAdapter();
  
  try {
    // Get applied migrations
    const appliedMigrations = await adapter.query('SELECT id, applied_at FROM migrations');
    const appliedMap = new Map(appliedMigrations.map((m: any) => [m.id, m.applied_at]));
    
    // Return status for all migrations
    return migrations.map(migration => {
      const appliedAt = appliedMap.get(migration.id);
      return {
        id: migration.id,
        name: migration.name,
        applied: appliedMap.has(migration.id),
        ...(appliedAt ? { appliedAt } : {})
      };
    });
  } catch (error) {
    console.error('❌ Failed to get migration status:', error);
    throw error;
  }
}