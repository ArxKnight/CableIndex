import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';
import { runMigrations, getMigrationStatus } from '../database/migrations/index.js';

const testDbConfig = {
  type: 'sqlite' as const,
  sqlite: { filename: ':memory:' },
};

describe('Database Connection', () => {
  beforeEach(async () => {
    // Use in-memory database for tests
    process.env.DATABASE_PATH = ':memory:';
  });

  afterEach(async () => {
    await connection.disconnect();
  });

  it('should connect to database successfully', async () => {
    await connection.connect(testDbConfig);
    expect(connection.isConnected()).toBe(true);
  });

  it('should test connection successfully', async () => {
    await connection.connect(testDbConfig);
    const isConnected = connection.testConnection();
    expect(isConnected).toBe(true);
  });

  it('should get existing connection', async () => {
    await connection.connect(testDbConfig);
    const db = connection.getConnection();
    expect(db).toBeDefined();
  });

  it('should throw error when getting connection before connecting', () => {
    expect(() => connection.getConnection()).toThrow('Database not connected');
  });

  it('should close connection successfully', async () => {
    await connection.connect(testDbConfig);
    expect(connection.isConnected()).toBe(true);
    
    await connection.disconnect();
    expect(connection.isConnected()).toBe(false);
  });
});

describe('Database Initialization', () => {
  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';
    await connection.connect(testDbConfig);
  });

  afterEach(async () => {
    await connection.disconnect();
  });

  it('should initialize database with migrations', async () => {
    await initializeDatabase({ runMigrations: true, seedData: false });
    
    expect(connection.isConnected()).toBe(true);
    
    // Check if migrations table exists
    const db = connection.getConnection();
    const result = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `).get();
    
    expect(result).toBeDefined();
  });

  it('should initialize database with seed data', async () => {
    await initializeDatabase({ runMigrations: true, seedData: true });
    
    const db = connection.getConnection();
    
    // Check if default admin user exists
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    expect(userCount.count).toBeGreaterThan(0);
    
    // Check if default settings exist
    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM app_settings').get() as { count: number };
    expect(settingsCount.count).toBeGreaterThan(0);
  });
});

describe('Database Migrations', () => {
  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';
    await connection.connect(testDbConfig);
  });

  afterEach(async () => {
    await connection.disconnect();
  });

  it('should run migrations successfully', async () => {
    await runMigrations();
    
    const db = connection.getConnection();
    
    // Check if all expected tables exist
    const tables = [
      'migrations',
      'users',
      'sites',
      'site_memberships',
      'labels',
      'app_settings',
      'invitations',
      'invitation_sites',
      'site_counters',
      'site_locations',
      'cable_types',
    ];
    
    for (const tableName of tables) {
      const result = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name=?
      `).get(tableName);
      
      expect(result).toBeDefined();
    }
  });

  it('should get migration status', async () => {
    await runMigrations();
    
    const status = await getMigrationStatus();
    expect(status).toHaveLength(8);

    const m001 = status.find((m) => m.id === '001');
    expect(m001).toBeDefined();
    expect(m001!.applied).toBe(true);

    // All known migrations should be applied after runMigrations()
    expect(status.every((m) => m.applied)).toBe(true);
  });

  it('should not run already applied migrations', async () => {
    // Run migrations twice
    await runMigrations();
    await runMigrations();
    
    const status = await getMigrationStatus();
    expect(status).toHaveLength(8);
    expect(status.every((m) => m.applied)).toBe(true);
  });
});

describe('Database Schema and Constraints', () => {
  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';
    await connection.connect(testDbConfig);
    await initializeDatabase({ runMigrations: true, seedData: false });
  });

  afterEach(async () => {
    await connection.disconnect();
  });

  describe('Users Table', () => {
    it('should create user with required fields', () => {
      const db = connection.getConnection();
      
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, username)
        VALUES (?, ?, ?)
      `);
      
      const result = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      expect(result.lastInsertRowid).toBeDefined();
      expect(result.changes).toBe(1);

      const created = db.prepare('SELECT role FROM users WHERE id = ?').get(result.lastInsertRowid) as { role: string };
      expect(created.role).toBe('USER');
    });

    it('should enforce unique email constraint', () => {
      const db = connection.getConnection();
      
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, username)
        VALUES (?, ?, ?)
      `);
      
      // Insert first user
      insertUser.run('test@example.com', 'hashed_password', 'Test User 1');
      
      // Try to insert duplicate email
      expect(() => {
        insertUser.run('test@example.com', 'hashed_password', 'Test User 2');
      }).toThrow();
    });

    it('should assign default role on user creation', () => {
      const db = connection.getConnection();
      
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, username)
        VALUES (?, ?, ?)
      `);
      
      const result = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = result.lastInsertRowid;
      
      // Role is stored on users table in current schema
      const role = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string };
      expect(role.role).toBe('USER');
    });
  });

  describe('Sites Table', () => {
    it('should create site with required fields', () => {
      const db = connection.getConnection();
      
      // First create a user
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, username)
        VALUES (?, ?, ?)
      `);
      const userResult = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = userResult.lastInsertRowid;
      
      // Create site
      const insertSite = db.prepare(`
        INSERT INTO sites (name, code, created_by, location, description)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const result = insertSite.run('Test Site', 'TS', userId, 'Test Location', 'Test Description');
      expect(result.lastInsertRowid).toBeDefined();
      expect(result.changes).toBe(1);
    });

    it('should enforce foreign key constraint with users', () => {
      const db = connection.getConnection();
      
      const insertSite = db.prepare(`
        INSERT INTO sites (name, code, created_by)
        VALUES (?, ?, ?)
      `);
      
      // Try to insert site with non-existent created_by
      expect(() => {
        insertSite.run('Test Site', 'TS2', 999);
      }).toThrow();
    });
  });

  describe('Labels Table', () => {
    it('should create label with required fields', () => {
      const db = connection.getConnection();
      
      // Create user and site first
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, username)
        VALUES (?, ?, ?)
      `);
      const userResult = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = userResult.lastInsertRowid;
      
      const insertSite = db.prepare(`
        INSERT INTO sites (name, code, created_by)
        VALUES (?, ?, ?)
      `);
      const siteResult = insertSite.run('Test Site', 'TEST', userId);
      const siteId = siteResult.lastInsertRowid;
      
      // Create label
      const insertLabel = db.prepare(`
        INSERT INTO labels (site_id, ref_number, ref_string, type, created_by)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const result = insertLabel.run(siteId, 1, 'TEST-001', 'cable', userId);
      expect(result.lastInsertRowid).toBeDefined();
      expect(result.changes).toBe(1);
    });

    it('should enforce unique reference number per site', () => {
      const db = connection.getConnection();
      
      // Create user and site first
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, username)
        VALUES (?, ?, ?)
      `);
      const userResult = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = userResult.lastInsertRowid;
      
      const insertSite = db.prepare(`
        INSERT INTO sites (name, code, created_by)
        VALUES (?, ?, ?)
      `);
      const siteResult = insertSite.run('Test Site', 'TEST', userId);
      const siteId = siteResult.lastInsertRowid;
      
      const insertLabel = db.prepare(`
        INSERT INTO labels (site_id, ref_number, ref_string, type, created_by)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      // Insert first label
      insertLabel.run(siteId, 1, 'TEST-001', 'cable', userId);
      
      // Try to insert duplicate reference number for same site
      expect(() => {
        insertLabel.run(siteId, 1, 'TEST-002', 'cable', userId);
      }).toThrow();
    });

    it('should enforce foreign key constraints', () => {
      const db = connection.getConnection();
      
      const insertLabel = db.prepare(`
        INSERT INTO labels (site_id, ref_number, ref_string, type, created_by)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      // Try to insert label with non-existent site_id and created_by
      expect(() => {
        insertLabel.run(999, 1, 'TEST-001', 'cable', 999);
      }).toThrow();
    });
  });

  describe('Application Settings', () => {
    it('should create and retrieve settings', () => {
      const db = connection.getConnection();
      
      const insertSetting = db.prepare(`
        INSERT INTO app_settings (key, value, description)
        VALUES (?, ?, ?)
      `);
      
      const result = insertSetting.run('test_setting', 'test_value', 'Test setting description');
      expect(result.lastInsertRowid).toBeDefined();
      
      // Retrieve setting
      const setting = db.prepare('SELECT * FROM app_settings WHERE key = ?').get('test_setting') as any;
      expect(setting.value).toBe('test_value');
      expect(setting.description).toBe('Test setting description');
    });

    it('should enforce unique key constraint', () => {
      const db = connection.getConnection();
      
      const insertSetting = db.prepare(`
        INSERT INTO app_settings (key, value)
        VALUES (?, ?)
      `);
      
      // Insert first setting
      insertSetting.run('test_setting', 'value1');
      
      // Try to insert duplicate key
      expect(() => {
        insertSetting.run('test_setting', 'value2');
      }).toThrow();
    });
  });

  describe('Timestamps', () => {
    it('should allow updating updated_at explicitly', async () => {
      const db = connection.getConnection();

      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, username)
        VALUES (?, ?, ?)
      `);

      const userResult = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = userResult.lastInsertRowid;

      const initial = db.prepare('SELECT created_at, updated_at FROM users WHERE id = ?').get(userId) as any;
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newUpdatedAt = new Date().toISOString();

      db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run('Updated Test User', newUpdatedAt, userId);
      const updated = db.prepare('SELECT created_at, updated_at FROM users WHERE id = ?').get(userId) as any;

      expect(updated.created_at).toBe(initial.created_at);
      expect(updated.updated_at).not.toBe(initial.updated_at);
    });
  });
});