import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';
import { runMigrations, getMigrationStatus } from '../database/migrations/index.js';

describe('Database Connection', () => {
  beforeEach(async () => {
    // Use in-memory database for tests
    process.env.DATABASE_PATH = ':memory:';
  });

  afterEach(() => {
    // Close connection after each test
    connection.close();
  });

  it('should connect to database successfully', async () => {
    const db = await connection.connect();
    expect(db).toBeDefined();
    expect(connection.isConnected()).toBe(true);
  });

  it('should test connection successfully', async () => {
    await connection.connect();
    const isConnected = connection.testConnection();
    expect(isConnected).toBe(true);
  });

  it('should get existing connection', async () => {
    await connection.connect();
    const db = connection.getConnection();
    expect(db).toBeDefined();
  });

  it('should throw error when getting connection before connecting', () => {
    expect(() => connection.getConnection()).toThrow('Database not connected');
  });

  it('should close connection successfully', async () => {
    await connection.connect();
    expect(connection.isConnected()).toBe(true);
    
    connection.close();
    expect(connection.isConnected()).toBe(false);
  });
});

describe('Database Initialization', () => {
  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';
  });

  afterEach(() => {
    connection.close();
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
    await connection.connect();
  });

  afterEach(() => {
    connection.close();
  });

  it('should run migrations successfully', async () => {
    await runMigrations();
    
    const db = connection.getConnection();
    
    // Check if all expected tables exist
    const tables = [
      'users', 'user_roles', 'tool_permissions', 
      'sites', 'labels', 'app_settings', 'user_invitations'
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
    
    const status = getMigrationStatus();
    expect(status).toHaveLength(1);
    expect(status[0].id).toBe('001');
    expect(status[0].applied).toBe(true);
  });

  it('should not run already applied migrations', async () => {
    // Run migrations twice
    await runMigrations();
    await runMigrations();
    
    const status = getMigrationStatus();
    expect(status).toHaveLength(1);
    expect(status[0].applied).toBe(true);
  });
});

describe('Database Schema and Constraints', () => {
  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';
    await initializeDatabase({ runMigrations: true, seedData: false });
  });

  afterEach(() => {
    connection.close();
  });

  describe('Users Table', () => {
    it('should create user with required fields', () => {
      const db = connection.getConnection();
      
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES (?, ?, ?)
      `);
      
      const result = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      expect(result.lastInsertRowid).toBeDefined();
      expect(result.changes).toBe(1);
    });

    it('should enforce unique email constraint', () => {
      const db = connection.getConnection();
      
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES (?, ?, ?)
      `);
      
      // Insert first user
      insertUser.run('test@example.com', 'hashed_password', 'Test User 1');
      
      // Try to insert duplicate email
      expect(() => {
        insertUser.run('test@example.com', 'hashed_password', 'Test User 2');
      }).toThrow();
    });

    it('should auto-assign default role and permissions on user creation', () => {
      const db = connection.getConnection();
      
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES (?, ?, ?)
      `);
      
      const result = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = result.lastInsertRowid;
      
      // Check if default role was assigned
      const role = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').get(userId) as { role: string };
      expect(role.role).toBe('user');
      
      // Check if default permissions were assigned
      const permissions = db.prepare('SELECT COUNT(*) as count FROM tool_permissions WHERE user_id = ?').get(userId) as { count: number };
      expect(permissions.count).toBeGreaterThan(0);
    });
  });

  describe('Sites Table', () => {
    it('should create site with required fields', () => {
      const db = connection.getConnection();
      
      // First create a user
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES (?, ?, ?)
      `);
      const userResult = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = userResult.lastInsertRowid;
      
      // Create site
      const insertSite = db.prepare(`
        INSERT INTO sites (name, location, description, user_id)
        VALUES (?, ?, ?, ?)
      `);
      
      const result = insertSite.run('Test Site', 'Test Location', 'Test Description', userId);
      expect(result.lastInsertRowid).toBeDefined();
      expect(result.changes).toBe(1);
    });

    it('should enforce foreign key constraint with users', () => {
      const db = connection.getConnection();
      
      const insertSite = db.prepare(`
        INSERT INTO sites (name, location, description, user_id)
        VALUES (?, ?, ?, ?)
      `);
      
      // Try to insert site with non-existent user_id
      expect(() => {
        insertSite.run('Test Site', 'Test Location', 'Test Description', 999);
      }).toThrow();
    });
  });

  describe('Labels Table', () => {
    it('should create label with required fields', () => {
      const db = connection.getConnection();
      
      // Create user and site first
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES (?, ?, ?)
      `);
      const userResult = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = userResult.lastInsertRowid;
      
      const insertSite = db.prepare(`
        INSERT INTO sites (name, location, description, user_id)
        VALUES (?, ?, ?, ?)
      `);
      const siteResult = insertSite.run('TEST', 'Test Location', 'Test Description', userId);
      const siteId = siteResult.lastInsertRowid;
      
      // Create label
      const insertLabel = db.prepare(`
        INSERT INTO labels (reference_number, site_id, user_id, source, destination)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const result = insertLabel.run('TEST-001', siteId, userId, 'Source A', 'Destination B');
      expect(result.lastInsertRowid).toBeDefined();
      expect(result.changes).toBe(1);
    });

    it('should enforce unique reference number per site', () => {
      const db = connection.getConnection();
      
      // Create user and site first
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES (?, ?, ?)
      `);
      const userResult = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = userResult.lastInsertRowid;
      
      const insertSite = db.prepare(`
        INSERT INTO sites (name, location, description, user_id)
        VALUES (?, ?, ?, ?)
      `);
      const siteResult = insertSite.run('TEST', 'Test Location', 'Test Description', userId);
      const siteId = siteResult.lastInsertRowid;
      
      const insertLabel = db.prepare(`
        INSERT INTO labels (reference_number, site_id, user_id, source, destination)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      // Insert first label
      insertLabel.run('TEST-001', siteId, userId, 'Source A', 'Destination B');
      
      // Try to insert duplicate reference number for same site
      expect(() => {
        insertLabel.run('TEST-001', siteId, userId, 'Source C', 'Destination D');
      }).toThrow();
    });

    it('should enforce foreign key constraints', () => {
      const db = connection.getConnection();
      
      const insertLabel = db.prepare(`
        INSERT INTO labels (reference_number, site_id, user_id, source, destination)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      // Try to insert label with non-existent site_id and user_id
      expect(() => {
        insertLabel.run('TEST-001', 999, 999, 'Source A', 'Destination B');
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

  describe('Timestamp Triggers', () => {
    it('should automatically update timestamps on record updates', () => {
      const db = connection.getConnection();
      
      // Create user
      const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES (?, ?, ?)
      `);
      const userResult = insertUser.run('test@example.com', 'hashed_password', 'Test User');
      const userId = userResult.lastInsertRowid;
      
      // Get initial timestamps
      const initialUser = db.prepare('SELECT created_at, updated_at FROM users WHERE id = ?').get(userId) as any;
      
      // Wait a moment and update user
      setTimeout(() => {
        const updateUser = db.prepare('UPDATE users SET full_name = ? WHERE id = ?');
        updateUser.run('Updated Test User', userId);
        
        // Check if updated_at changed
        const updatedUser = db.prepare('SELECT created_at, updated_at FROM users WHERE id = ?').get(userId) as any;
        
        expect(updatedUser.created_at).toBe(initialUser.created_at);
        expect(updatedUser.updated_at).not.toBe(initialUser.updated_at);
      }, 10);
    });
  });
});