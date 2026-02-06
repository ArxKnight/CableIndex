import express from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import connection from '../database/connection.js';
import { MySQLConfig } from '../database/adapters/base.js';
import { MySQLAdapter } from '../database/adapters/mysql.js';
import { initializeDatabase } from '../database/init.js';
import UserModel from '../models/User.js';
import { isSetupComplete, setupMarkerPath } from '../utils/setup.js';
import { validatePassword } from '../utils/password.js';
import { normalizeUsername } from '../utils/username.js';

const router = express.Router();

// Setup configuration schema
const setupSchema = z.object({
  database: z.object({
    host: z.string(),
    port: z.number().min(1).max(65535),
    user: z.string(),
    password: z.string(),
    database: z.string(),
    ssl: z.boolean().optional(),
  }),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    username: z.string().min(1),
  }),
});

type SetupData = z.infer<typeof setupSchema>;

/**
 * Check if the application needs setup
 */
router.get('/status', async (req, res) => {
  try {
    const setupComplete = await isSetupComplete();
    
    res.json({
      success: true,
      setupRequired: !setupComplete,
      currentConfig: setupComplete ? {
        database: connection.getConfig() ? 'mysql' : 'unknown'
      } : null
    });
  } catch (error) {
    console.error('❌ Setup status check failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    res.status(500).json({
      success: false,
      error: 'Failed to check setup status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Test database connection
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { database } = setupSchema.pick({ database: true }).parse(req.body);
    
    // Create temporary connection to test
    const testConfig: MySQLConfig = {
      host: database.host,
      port: database.port,
      user: database.user,
      password: database.password,
      database: database.database,
      ...(database.ssl ? { ssl: {} } : {}),
    };

    // Test connection without affecting main connection
    const testAdapter = new MySQLAdapter(testConfig);

    await testAdapter.connect();
    const isConnected = testAdapter.testConnection();
    await testAdapter.disconnect();

    res.json({
      success: true,
      connected: isConnected,
      message: isConnected ? 'Connection successful' : 'Connection failed'
    });
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    res.status(400).json({
      success: false,
      connected: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
      details: error instanceof Error ? error.stack : String(error)
    });
  }
});

/**
 * Complete initial setup
 */
router.post('/complete', async (req, res) => {
  try {
    // Check if setup is already complete
    if (fs.existsSync(setupMarkerPath)) {
      return res.status(400).json({
        success: false,
        error: 'Setup has already been completed'
      });
    }

    const setupData = setupSchema.parse(req.body);

    const normalizedAdminUsername = normalizeUsername(setupData.admin.username);
    if (!normalizedAdminUsername) {
      return res.status(400).json({
        success: false,
        error: 'Admin username is required',
      });
    }

    const passwordValidation = validatePassword(setupData.admin.password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Password does not meet requirements',
        details: passwordValidation.errors,
      });
    }
    
    // Create database configuration
    const dbConfig: MySQLConfig = {
      host: setupData.database.host,
      port: setupData.database.port,
      user: setupData.database.user,
      password: setupData.database.password,
      database: setupData.database.database,
      ...(setupData.database.ssl ? { ssl: {} } : {}),
    };

    // Connect to database
    await connection.connect(dbConfig);

    // Initialize database (run migrations)
    await initializeDatabase({
      runMigrations: true,
      seedData: false
    });

    // Create admin user
    const userModel = new UserModel();
    
    console.log(`📝 Creating admin user: ${setupData.admin.email}`);
    
    // Check if user already exists
    let adminUser = await userModel.findByEmail(setupData.admin.email);
    
    if (!adminUser) {
      // Create new admin user if doesn't exist
      // NOTE: Pass plain password to create() - it will hash internally
      console.log(`✓ User does not exist, creating new admin user`);
      adminUser = await userModel.create({
        email: setupData.admin.email,
        password: setupData.admin.password,
        username: normalizedAdminUsername,
        role: 'GLOBAL_ADMIN'
      });
      console.log(`✓ Admin user created: ${adminUser.id} (${adminUser.email})`);
    } else {
      // Update existing user with new credentials
      console.log(`⚠️  User already exists, updating credentials for: ${adminUser.email}`);
      adminUser = await userModel.update(adminUser.id, {
        username: normalizedAdminUsername,
        role: 'GLOBAL_ADMIN'
      }) || adminUser;
      
      // Update password if user exists
      // NOTE: updatePassword expects plain password, it hashes internally
      await userModel.updatePassword(adminUser.id, setupData.admin.password);
      console.log(`✓ Admin user updated: ${adminUser.id} (${adminUser.email})`);
    }

    console.log(`✓ Admin user setup complete: ${adminUser.email} (ID: ${adminUser.id})`);

    // Save configuration to environment file
    // Write to /app/.env instead of /app/backend/.env for proper permissions
    const envPath = path.join('/app', '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Update or add database configuration
    const dbEnvVars: string[] = [];
    dbEnvVars.push(
      `MYSQL_HOST=${setupData.database.host}`,
      `MYSQL_PORT=${setupData.database.port}`,
      `MYSQL_USER=${setupData.database.user}`,
      `MYSQL_PASSWORD=${setupData.database.password}`,
      `MYSQL_DATABASE=${setupData.database.database}`,
      `MYSQL_SSL=${setupData.database.ssl || false}`
    );

    // Remove ALL existing DB config lines (including those from Unraid) and add new ones
    const lines = envContent.split('\n').filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('MYSQL_HOST=') &&
             !trimmed.startsWith('MYSQL_PORT=') &&
             !trimmed.startsWith('MYSQL_USER=') &&
             !trimmed.startsWith('MYSQL_PASSWORD=') &&
             !trimmed.startsWith('MYSQL_DATABASE=') &&
             !trimmed.startsWith('MYSQL_SSL=') &&
             !trimmed.startsWith('SETUP_COMPLETE=');
    });
    
    lines.push(...dbEnvVars);
    lines.push('SETUP_COMPLETE=true');  // Mark setup complete in env file
    
    fs.writeFileSync(envPath, lines.join('\n'));
    console.log(`💾 Configuration saved to ${envPath}`);
    
    // Clear all database-related env vars to remove Unraid/Docker defaults
    delete process.env.MYSQL_HOST;
    delete process.env.MYSQL_PORT;
    delete process.env.MYSQL_USER;
    delete process.env.MYSQL_PASSWORD;
    delete process.env.MYSQL_DATABASE;
    delete process.env.MYSQL_SSL;
    
    // Mark setup complete in current process env
    process.env.SETUP_COMPLETE = 'true';
    
    // Reload environment variables from the updated .env file
    // This will populate the cleared vars with the setup user's choice
    dotenv.config({ path: envPath, override: true });
    console.log('🔄 Environment variables reloaded from .env (Unraid defaults cleared)');
    
    // Log what database is now configured
    console.log('✅ Database configured for setup: mysql');
    console.log(`   Host: ${process.env.MYSQL_HOST}`);
    
    // Reset database connection to force reconnection with new configuration
    await connection.reset();
    console.log('✅ Database connection reset - will reconnect with new configuration on next request');
    
    // Mark setup as complete (try to write marker file, but don't fail if it can't)
    try {
      const dataDir = path.dirname(setupMarkerPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(setupMarkerPath, JSON.stringify({
        completedAt: new Date().toISOString(),
        databaseType: 'mysql',
        adminEmail: setupData.admin.email
      }, null, 2));
      
      console.log('✅ Setup marker file created');
    } catch (fileError) {
      console.warn('⚠️  Could not write setup marker file (this is non-critical):', fileError instanceof Error ? fileError.message : fileError);
      // Don't fail setup if we can't write the marker file
      // The setup is still complete - admin user exists and migrations ran
    }

    res.json({
      success: true,
      message: 'Setup completed successfully',
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        username: adminUser.username
      }
    });
  } catch (error) {
    console.error('❌ Setup completion failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
    }
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Setup failed',
      details: error instanceof Error ? error.stack : String(error)
    });
  }
});

export default router;