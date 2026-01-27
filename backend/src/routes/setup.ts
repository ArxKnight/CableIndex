import express from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import connection from '../database/connection.js';
import { DatabaseConfig } from '../database/adapters/base.js';
import { initializeDatabase } from '../database/init.js';
import UserModel from '../models/User.js';
import { hashPassword } from '../utils/password.js';

const router = express.Router();

// Setup configuration schema
const setupSchema = z.object({
  database: z.object({
    type: z.enum(['sqlite', 'mysql']),
    sqlite: z.object({
      filename: z.string().optional(),
    }).optional(),
    mysql: z.object({
      host: z.string(),
      port: z.number().min(1).max(65535),
      user: z.string(),
      password: z.string(),
      database: z.string(),
      ssl: z.boolean().optional(),
    }).optional(),
  }),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(1),
  }),
});

type SetupData = z.infer<typeof setupSchema>;

/**
 * Check if the application needs setup
 */
router.get('/status', async (req, res) => {
  try {
    const setupFile = path.join(process.cwd(), 'data', '.setup-complete');
    const isSetupComplete = fs.existsSync(setupFile);
    
    res.json({
      success: true,
      setupRequired: !isSetupComplete,
      currentConfig: isSetupComplete ? {
        database: connection.getConfig()?.type || 'unknown'
      } : null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check setup status'
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
    const testConfig: DatabaseConfig = {
      type: database.type,
    };

    if (database.type === 'sqlite') {
      testConfig.sqlite = {
        filename: database.sqlite?.filename || '/app/data/cable-manager.db'
      };
    } else if (database.type === 'mysql') {
      testConfig.mysql = {
        host: database.mysql!.host,
        port: database.mysql!.port,
        user: database.mysql!.user,
        password: database.mysql!.password,
        database: database.mysql!.database,
        ssl: database.mysql?.ssl || false
      };
    }

    // Test connection without affecting main connection
    let testAdapter;
    if (database.type === 'sqlite') {
      const { SQLiteAdapter } = await import('../database/adapters/sqlite.js');
      testAdapter = new SQLiteAdapter(testConfig);
    } else if (database.type === 'mysql') {
      const { MySQLAdapter } = await import('../database/adapters/mysql.js');
      testAdapter = new MySQLAdapter(testConfig);
    } else {
      res.status(400).json({
        success: false,
        connected: false,
        error: 'Invalid database type'
      });
      return;
    }

    await testAdapter.connect();
    const isConnected = testAdapter.testConnection();
    await testAdapter.disconnect();

    res.json({
      success: true,
      connected: isConnected,
      message: isConnected ? 'Connection successful' : 'Connection failed'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      connected: false,
      error: error instanceof Error ? error.message : 'Connection test failed'
    });
  }
});

/**
 * Complete initial setup
 */
router.post('/complete', async (req, res) => {
  try {
    // Check if setup is already complete
    const setupFile = path.join(process.cwd(), 'data', '.setup-complete');
    if (fs.existsSync(setupFile)) {
      return res.status(400).json({
        success: false,
        error: 'Setup has already been completed'
      });
    }

    const setupData = setupSchema.parse(req.body);
    
    // Create database configuration
    const dbConfig: DatabaseConfig = {
      type: setupData.database.type,
    };

    if (setupData.database.type === 'sqlite') {
      dbConfig.sqlite = {
        filename: setupData.database.sqlite?.filename || '/app/data/cable-manager.db'
      };
    } else if (setupData.database.type === 'mysql') {
      dbConfig.mysql = {
        host: setupData.database.mysql!.host,
        port: setupData.database.mysql!.port,
        user: setupData.database.mysql!.user,
        password: setupData.database.mysql!.password,
        database: setupData.database.mysql!.database,
        ssl: setupData.database.mysql?.ssl || false
      };
    }

    // Connect to database
    await connection.connect(dbConfig);

    // Initialize database (run migrations)
    await initializeDatabase({
      runMigrations: true,
      seedData: false
    });

    // Create admin user
    const userModel = new UserModel();
    const hashedPassword = await hashPassword(setupData.admin.password);
    
    const adminUser = await userModel.create({
      email: setupData.admin.email,
      password: hashedPassword,
      full_name: setupData.admin.fullName,
      role: 'admin'
    });

    // Save configuration to environment file
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Update or add database configuration
    const dbEnvVars = [];
    if (setupData.database.type === 'mysql') {
      dbEnvVars.push(
        `DB_TYPE=mysql`,
        `MYSQL_HOST=${setupData.database.mysql!.host}`,
        `MYSQL_PORT=${setupData.database.mysql!.port}`,
        `MYSQL_USER=${setupData.database.mysql!.user}`,
        `MYSQL_PASSWORD=${setupData.database.mysql!.password}`,
        `MYSQL_DATABASE=${setupData.database.mysql!.database}`,
        `MYSQL_SSL=${setupData.database.mysql!.ssl || false}`
      );
    } else {
      dbEnvVars.push(
        `DB_TYPE=sqlite`,
        `DATABASE_PATH=${setupData.database.sqlite?.filename || path.join(process.cwd(), 'data', 'cable-manager.db')}`
      );
    }

    // Remove existing DB config lines and add new ones
    const lines = envContent.split('\n').filter(line => 
      !line.startsWith('DB_TYPE=') &&
      !line.startsWith('MYSQL_') &&
      !line.startsWith('DATABASE_PATH=')
    );
    
    lines.push(...dbEnvVars);
    
    fs.writeFileSync(envPath, lines.join('\n'));

    // Mark setup as complete
    const dataDir = path.dirname(setupFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(setupFile, JSON.stringify({
      completedAt: new Date().toISOString(),
      databaseType: setupData.database.type,
      adminEmail: setupData.admin.email
    }, null, 2));

    res.json({
      success: true,
      message: 'Setup completed successfully',
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        fullName: adminUser.full_name
      }
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Setup failed'
    });
  }
});

export default router;