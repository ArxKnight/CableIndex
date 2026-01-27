import connection from '../connection.js';
import { Migration001_InitialSchema } from './001_initial_schema.js';
import { Migration002_AddRoleToUsers } from './002_add_role_to_users.js';

export interface Migration {
  id: string;
  name: string;
  up: (db: import('better-sqlite3').Database) => void;
  down: (db: import('better-sqlite3').Database) => void;
}

// List of all migrations in order
const migrations: Migration[] = [
  Migration001_InitialSchema,
  Migration002_AddRoleToUsers,
];

export async function runMigrations(): Promise<void> {
  const db = connection.getConnection();
  
  try {
    // Create migrations table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Get applied migrations
    const appliedMigrations = db.prepare('SELECT id FROM migrations').all() as { id: string }[];
    const appliedIds = new Set(appliedMigrations.map(m => m.id));
    
    // Run pending migrations
    for (const migration of migrations) {
      if (!appliedIds.has(migration.id)) {
        console.log(`🔄 Running migration: ${migration.name}`);
        
        // Begin transaction for migration
        const transaction = db.transaction(() => {
          // Run migration
          migration.up(db);
          
          // Record migration as applied
          db.prepare('INSERT INTO migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
        });
        
        transaction();
        console.log(`✅ Migration completed: ${migration.name}`);
      }
    }
    
    console.log('✅ All migrations completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function rollbackMigration(migrationId: string): Promise<void> {
  const db = connection.getConnection();
  
  try {
    // Find migration
    const migration = migrations.find(m => m.id === migrationId);
    if (!migration) {
      throw new Error(`Migration not found: ${migrationId}`);
    }
    
    // Check if migration is applied
    const applied = db.prepare('SELECT id FROM migrations WHERE id = ?').get(migrationId);
    if (!applied) {
      throw new Error(`Migration not applied: ${migrationId}`);
    }
    
    console.log(`🔄 Rolling back migration: ${migration.name}`);
    
    // Begin transaction for rollback
    const transaction = db.transaction(() => {
      // Run rollback
      migration.down(db);
      
      // Remove migration record
      db.prepare('DELETE FROM migrations WHERE id = ?').run(migrationId);
    });
    
    transaction();
    console.log(`✅ Migration rolled back: ${migration.name}`);
  } catch (error) {
    console.error('❌ Migration rollback failed:', error);
    throw error;
  }
}

export function getMigrationStatus(): Array<{ id: string; name: string; applied: boolean; appliedAt?: string }> {
  const db = connection.getConnection();
  
  try {
    // Get applied migrations
    const appliedMigrations = db.prepare('SELECT id, applied_at FROM migrations').all() as Array<{ id: string; applied_at: string }>;
    const appliedMap = new Map(appliedMigrations.map(m => [m.id, m.applied_at]));
    
    // Return status for all migrations
    return migrations.map(migration => ({
      id: migration.id,
      name: migration.name,
      applied: appliedMap.has(migration.id),
      appliedAt: appliedMap.get(migration.id),
    }));
  } catch (error) {
    console.error('❌ Failed to get migration status:', error);
    throw error;
  }
}