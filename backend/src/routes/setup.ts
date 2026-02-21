import express from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import connection from '../database/connection.js';
import { MySQLConfig } from '../database/adapters/base.js';
import mysql from 'mysql2/promise';
import { initializeDatabase } from '../database/init.js';
import { LATEST_MIGRATION_ID } from '../database/migrations/index.js';
import UserModel from '../models/User.js';
import { isSetupComplete, setupMarkerPath } from '../utils/setup.js';
import { validatePassword } from '../utils/password.js';
import { normalizeUsername } from '../utils/username.js';
import { ensureSidSecretKeyConfigured } from '../utils/sidSecrets.js';

const router = express.Router();

const databaseSchema = z.object({
  host: z.string(),
  port: z.number().min(1).max(65535),
  user: z.string(),
  password: z.string(),
  database: z.string(),
  ssl: z.boolean().optional(),
});

const adminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(1),
});

// Setup configuration schema
const setupSchema = z
  .object({
    database: databaseSchema,
    reuseExistingDatabase: z.boolean().optional(),
    admin: adminSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.reuseExistingDatabase && !data.admin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Admin details are required when not reusing an existing database',
        path: ['admin'],
      });
    }
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
 *
 * Note: This must NOT create the database.
 * It connects to the server, then probes whether the database exists and
 * whether it appears to be an InfraDB installation.
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { database } = z.object({ database: databaseSchema }).parse(req.body);

    const baseConfig = {
      host: database.host,
      port: database.port,
      user: database.user,
      password: database.password,
      ...(database.ssl ? { ssl: {} } : {}),
    };

    const serverConn = await mysql.createConnection({
      ...baseConfig,
      multipleStatements: false,
    });

    try {
      await serverConn.ping();

      const dbName = database.database;
      const [schemas] = await serverConn.execute(
        'SELECT SCHEMA_NAME AS schema_name FROM information_schema.schemata WHERE SCHEMA_NAME = ? LIMIT 1',
        [dbName],
      );

      const databaseExists = Array.isArray(schemas) && schemas.length > 0;

      let infraDbSchemaDetected = false;
      let migrationsUpToDate: boolean | null = null;
      let existingGlobalAdmin: { email: string; username: string; role: string } | null = null;
      let schemaDetails: { missingTables: string[] } | null = null;

      if (databaseExists) {
        const dbConn = await mysql.createConnection({
          ...baseConfig,
          database: dbName,
          multipleStatements: false,
        });

        try {
          const requiredTables = ['users', 'sites', 'labels', 'app_settings', 'migrations'];
          const [tables] = await dbConn.execute(
            'SELECT TABLE_NAME AS table_name FROM information_schema.tables WHERE table_schema = ? AND table_name IN (?, ?, ?, ?, ?)',
            [dbName, ...requiredTables],
          );

          const existing = new Set(
            Array.isArray(tables) ? (tables as any[]).map((t) => String(t.table_name)) : [],
          );
          const missingTables = requiredTables.filter((t) => !existing.has(t));

          infraDbSchemaDetected = missingTables.length === 0;
          schemaDetails = missingTables.length > 0 ? { missingTables } : null;

          if (existing.has('migrations')) {
            try {
              if (!LATEST_MIGRATION_ID) {
                migrationsUpToDate = null;
              } else {
                const [migrationRow] = await dbConn.execute(
                  'SELECT 1 AS ok FROM migrations WHERE id = ? LIMIT 1',
                  [LATEST_MIGRATION_ID],
                );
                migrationsUpToDate = Array.isArray(migrationRow) && migrationRow.length > 0;
              }
            } catch {
              migrationsUpToDate = null;
            }
          }

          if (infraDbSchemaDetected) {
            try {
              const [admins] = await dbConn.execute(
                'SELECT email, username, role FROM users WHERE role = ? ORDER BY id ASC LIMIT 1',
                ['GLOBAL_ADMIN'],
              );
              if (Array.isArray(admins) && admins.length > 0) {
                const row = admins[0] as any;
                existingGlobalAdmin = {
                  email: String(row.email),
                  username: String(row.username),
                  role: String(row.role),
                };
              }
            } catch {
              existingGlobalAdmin = null;
            }
          }
        } finally {
          await dbConn.end();
        }
      }

      res.json({
        success: true,
        connected: true,
        message: 'Connection successful',
        databaseExists,
        infraDbSchemaDetected,
        migrationsUpToDate,
        latestMigrationId: LATEST_MIGRATION_ID ?? null,
        existingGlobalAdmin,
        ...(schemaDetails ? { schemaDetails } : {}),
      });
    } finally {
      await serverConn.end();
    }
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    res.status(400).json({
      success: false,
      connected: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
      details: error instanceof Error ? error.stack : String(error),
    });
  }
});

/**
 * Complete initial setup
 */
router.post('/complete', async (req, res) => {
  try {
    // Check if setup is already complete.
    // If the marker exists but DB env vars are missing, allow re-running setup.
    const hasMySqlEnv = Boolean(
      process.env.MYSQL_HOST &&
      process.env.MYSQL_DATABASE &&
      process.env.MYSQL_USER &&
      process.env.MYSQL_PASSWORD
    );

    if (fs.existsSync(setupMarkerPath) && hasMySqlEnv) {
      return res.status(400).json({
        success: false,
        error: 'Setup has already been completed'
      });
    }

    if (fs.existsSync(setupMarkerPath) && !hasMySqlEnv) {
      console.warn('⚠️  Setup marker exists but MySQL env vars are missing; allowing setup to run again');
    }

    const setupData: SetupData = setupSchema.parse(req.body);
    const reuseExistingDatabase = Boolean(setupData.reuseExistingDatabase);

    let normalizedAdminUsername: string | null = null;
    if (!reuseExistingDatabase) {
      if (!setupData.admin) {
        return res.status(400).json({
          success: false,
          error: 'Admin details are required',
        });
      }

      normalizedAdminUsername = normalizeUsername(setupData.admin.username);
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

    const userModel = new UserModel();
    let adminUser: any;

    if (reuseExistingDatabase) {
      const admins = await connection
        .getAdapter()
        .query('SELECT id, email, username, role FROM users WHERE role = ? ORDER BY id ASC LIMIT 1', [
          'GLOBAL_ADMIN',
        ]);

      if (admins.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            'Existing InfraDB database detected but no GLOBAL_ADMIN user was found. Choose a different database name or create an admin user.',
        });
      }

      adminUser = admins[0];
      console.log(`✓ Reusing existing admin user: ${adminUser.email} (ID: ${adminUser.id})`);
    } else {
      console.log(`📝 Creating admin user: ${setupData.admin!.email}`);

      // Check if user already exists
      adminUser = await userModel.findByEmail(setupData.admin!.email);

      if (!adminUser) {
        console.log(`✓ User does not exist, creating new admin user`);
        adminUser = await userModel.create({
          email: setupData.admin!.email,
          password: setupData.admin!.password,
          username: normalizedAdminUsername!,
          role: 'GLOBAL_ADMIN',
        });
        console.log(`✓ Admin user created: ${adminUser.id} (${adminUser.email})`);
      } else {
        console.log(`⚠️  User already exists, updating credentials for: ${adminUser.email}`);
        adminUser =
          (await userModel.update(adminUser.id, {
            username: normalizedAdminUsername!,
            role: 'GLOBAL_ADMIN',
          })) || adminUser;

        await userModel.updatePassword(adminUser.id, setupData.admin!.password);
        console.log(`✓ Admin user updated: ${adminUser.id} (${adminUser.email})`);
      }

      console.log(`✓ Admin user setup complete: ${adminUser.email} (ID: ${adminUser.id})`);
    }

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
        adminEmail: adminUser?.email
      }, null, 2));
      
      console.log('✅ Setup marker file created');
    } catch (fileError) {
      console.warn('⚠️  Could not write setup marker file (this is non-critical):', fileError instanceof Error ? fileError.message : fileError);
      // Don't fail setup if we can't write the marker file
      // The setup is still complete - admin user exists and migrations ran
    }

    // Ensure SID password encryption key exists (auto-generated and persisted).
    // This prevents the UI from requiring a manual key entry.
    ensureSidSecretKeyConfigured();

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