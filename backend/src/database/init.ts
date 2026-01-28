import connection from './connection.js';
import { runMigrations } from './migrations/index.js';

export interface InitOptions {
  runMigrations?: boolean;
  seedData?: boolean;
}

export async function initializeDatabase(options: InitOptions = {}): Promise<void> {
  const { runMigrations: shouldRunMigrations = true, seedData = false } = options;

  try {
    console.log('🔄 Initializing database...');
    
    // Database should already be connected by this point
    if (!connection.isConnected()) {
      throw new Error('Database connection not established');
    }
    
    // Test connection
    if (!connection.testConnection()) {
      throw new Error('Database connection test failed');
    }
    
    // Run migrations if requested
    if (shouldRunMigrations) {
      console.log('🔄 Running database migrations...');
      await runMigrations();
      console.log('✅ Database migrations completed');
    }
    
    // Seed data if requested (for development/testing)
    if (seedData) {
      console.log('🔄 Seeding database...');
      await seedDatabase();
      console.log('✅ Database seeding completed');
    }
    
    console.log('✅ Database initialization completed');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function seedDatabase(): Promise<void> {
  const adapter = connection.getAdapter();
  
  try {
    await adapter.beginTransaction();
    const nowIso = new Date().toISOString();

    // Create default admin user if none exists
    const userCountRows = await adapter.query('SELECT COUNT(*) as count FROM users');
    const userCount = userCountRows[0] as { count: number };
    
    if (userCount.count === 0) {
      console.log('Creating default admin user...');
      
      // Insert default admin user (password will be hashed by the User model)
      const insertUser = await adapter.execute(
        `INSERT INTO users (email, password_hash, full_name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin@example.com', 'temp_hash', 'System Administrator', 'GLOBAL_ADMIN', nowIso, nowIso]
      );
      
      // Note: This is a placeholder - actual password hashing should be done by the User model
      const userId = insertUser.insertId;
      
      // GLOBAL_ADMIN role assigned in users table
      
      console.log('✅ Default admin user created');
    }
    
    // Create default application settings
    const settingsCountRows = await adapter.query('SELECT COUNT(*) as count FROM app_settings');
    const settingsCount = settingsCountRows[0] as { count: number };
    
    if (settingsCount.count === 0) {
      console.log('Creating default application settings...');
      
      const insertSettingSql = `
        INSERT INTO app_settings (key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `;
      
      await adapter.execute(insertSettingSql, ['public_registration_enabled', 'false', nowIso, nowIso]);
      await adapter.execute(insertSettingSql, ['app_name', 'Cable Manager MVP', nowIso, nowIso]);
      await adapter.execute(insertSettingSql, ['app_version', '1.0.0', nowIso, nowIso]);
      
      console.log('✅ Default application settings created');
    }

    await adapter.commit();
  } catch (error) {
    await adapter.rollback();
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
}

// Graceful shutdown handler
export function setupDatabaseShutdown(): void {
  const gracefulShutdown = async () => {
    console.log('🔄 Shutting down database connection...');
    await connection.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGUSR2', gracefulShutdown); // For nodemon
}