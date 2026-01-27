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
  const db = connection.getConnection();
  
  try {
    // Begin transaction
    const transaction = db.transaction(() => {
      // Create default admin user if none exists
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      
      if (userCount.count === 0) {
        console.log('Creating default admin user...');
        
        // Insert default admin user (password will be hashed by the User model)
        const insertUser = db.prepare(`
          INSERT INTO users (email, password_hash, full_name, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `);
        
        // Note: This is a placeholder - actual password hashing should be done by the User model
        const userId = insertUser.run('admin@example.com', 'temp_hash', 'System Administrator').lastInsertRowid;
        
        // Assign admin role
        const insertRole = db.prepare(`
          INSERT INTO user_roles (user_id, role, created_at)
          VALUES (?, 'admin', datetime('now'))
        `);
        insertRole.run(userId);
        
        console.log('✅ Default admin user created');
      }
      
      // Create default application settings
      const settingsCount = db.prepare('SELECT COUNT(*) as count FROM app_settings').get() as { count: number };
      
      if (settingsCount.count === 0) {
        console.log('Creating default application settings...');
        
        const insertSetting = db.prepare(`
          INSERT INTO app_settings (key, value, created_at, updated_at)
          VALUES (?, ?, datetime('now'), datetime('now'))
        `);
        
        insertSetting.run('public_registration_enabled', 'false');
        insertSetting.run('app_name', 'Cable Manager MVP');
        insertSetting.run('app_version', '1.0.0');
        
        console.log('✅ Default application settings created');
      }
    });
    
    transaction();
  } catch (error) {
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