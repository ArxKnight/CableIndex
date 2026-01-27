import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { BaseDatabaseAdapter, DatabaseConfig } from './base.js';

export class SQLiteAdapter extends BaseDatabaseAdapter {
  private db: Database.Database | null = null;
  private transaction: Database.Transaction | null = null;

  constructor(config: DatabaseConfig) {
    super(config);
    if (!config.sqlite) {
      throw new Error('SQLite configuration is required');
    }
  }

  async connect(): Promise<void> {
    try {
      const filename = this.config.sqlite!.filename;
      
      // Ensure directory exists
      const dir = path.dirname(filename);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(filename, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
        fileMustExist: false,
      });

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');
      
      this.connected = true;
      console.log(`✅ SQLite connected: ${filename}`);
    } catch (error) {
      console.error('❌ SQLite connection failed:', error);
      throw new Error(`Failed to connect to SQLite: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.connected = false;
      console.log('✅ SQLite disconnected');
    }
  }

  testConnection(): boolean {
    if (!this.db) return false;
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.db) throw new Error('Database not connected');
    
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.all(...params);
      return Array.isArray(result) ? result : [result];
    } catch (error) {
      console.error('SQLite query error:', error);
      throw error;
    }
  }

  async execute(sql: string, params: any[] = []): Promise<{ insertId?: number; affectedRows: number }> {
    if (!this.db) throw new Error('Database not connected');
    
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      return {
        insertId: result.lastInsertRowid as number,
        affectedRows: result.changes
      };
    } catch (error) {
      console.error('SQLite execute error:', error);
      throw error;
    }
  }

  async beginTransaction(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    this.transaction = this.db.transaction(() => {});
  }

  async commit(): Promise<void> {
    // SQLite transactions are handled differently - this is a no-op for compatibility
  }

  async rollback(): Promise<void> {
    // SQLite transactions are handled differently - this is a no-op for compatibility
  }

  getLastInsertId(): number {
    if (!this.db) throw new Error('Database not connected');
    const result = this.db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    return result.id;
  }

  // SQLite-specific method for direct access
  getDatabase(): Database.Database {
    if (!this.db) throw new Error('Database not connected');
    return this.db;
  }
}