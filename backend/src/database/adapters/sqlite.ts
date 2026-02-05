import path from 'path';
import fs from 'fs';
import { BaseDatabaseAdapter, DatabaseConfig } from './base.js';

type SqliteRunResult = {
  changes: number;
  lastInsertRowid?: number;
};

type SqliteStatementLike = {
  all: (...params: any[]) => any[];
  get: (...params: any[]) => any;
  run: (...params: any[]) => SqliteRunResult;
};

type SqliteDatabaseLike = {
  prepare: (sql: string) => SqliteStatementLike;
  exec: (sql: string) => void;
  pragma: (pragma: string) => any;
  close: () => void;
};

class SqlJsStatement implements SqliteStatementLike {
  constructor(
    private readonly stmt: any,
    private readonly db: any
  ) {}

  all(...params: any[]): any[] {
    this.stmt.bind(params);
    const rows: any[] = [];
    while (this.stmt.step()) {
      rows.push(this.stmt.getAsObject());
    }
    this.stmt.reset();
    return rows;
  }

  get(...params: any[]): any {
    this.stmt.bind(params);
    const hasRow = this.stmt.step();
    const row = hasRow ? this.stmt.getAsObject() : undefined;
    this.stmt.reset();
    return row;
  }

  run(...params: any[]): SqliteRunResult {
    this.stmt.bind(params);
    // For non-SELECT statements, step() executes once.
    this.stmt.step();
    this.stmt.reset();

    const changes = typeof this.db.getRowsModified === 'function' ? this.db.getRowsModified() : 0;
    let lastInsertRowid: number | undefined;

    try {
      const result = this.db.exec('SELECT last_insert_rowid() AS id');
      const value = result?.[0]?.values?.[0]?.[0];
      if (typeof value === 'number') {
        lastInsertRowid = value;
      }
    } catch {
      // ignore
    }

    return {
      changes,
      ...(lastInsertRowid !== undefined ? { lastInsertRowid } : {}),
    };
  }
}

class SqlJsDatabase implements SqliteDatabaseLike {
  constructor(private readonly db: any) {}

  prepare(sql: string): SqliteStatementLike {
    const stmt = this.db.prepare(sql);
    return new SqlJsStatement(stmt, this.db);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(pragma: string): any {
    this.db.exec(`PRAGMA ${pragma}`);
    return undefined;
  }

  close(): void {
    this.db.close();
  }
}

export class SQLiteAdapter extends BaseDatabaseAdapter {
  private db: SqliteDatabaseLike | null = null;
  private inTransaction = false;

  constructor(config: DatabaseConfig) {
    super(config);
    if (!config.sqlite) {
      throw new Error('SQLite configuration is required');
    }
  }

  async connect(): Promise<void> {
    try {
      const filename = this.config.sqlite!.filename;
      
      // Ensure directory exists with proper permissions
      const dir = path.dirname(filename);
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
          console.log(`📁 Created directory: ${dir}`);
        } catch (mkdirError) {
          console.error(`❌ Failed to create directory ${dir}:`, mkdirError);
          throw new Error(`Cannot create database directory: ${mkdirError instanceof Error ? mkdirError.message : 'Permission denied'}`);
        }
      }
      
      // Check if directory is writable
      try {
        fs.accessSync(dir, fs.constants.W_OK);
      } catch (accessError) {
        throw new Error(`Database directory ${dir} is not writable. Please check permissions.`);
      }

      // Prefer better-sqlite3 when available, but fall back to sql.js when
      // native bindings aren't present (common on Windows without build tools).
      try {
        const { default: BetterSqlite3 } = await import('better-sqlite3');
        const nativeDb = new BetterSqlite3(filename, {
          verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
          fileMustExist: false,
        });

        // Enable foreign keys
        nativeDb.pragma('foreign_keys = ON');
        this.db = nativeDb as unknown as SqliteDatabaseLike;
      } catch (nativeError) {
        const message = nativeError instanceof Error ? nativeError.message : String(nativeError);
        console.warn('⚠️  better-sqlite3 unavailable, falling back to sql.js:', message);

        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs({
          // sql.js will resolve its wasm internally in Node
        } as any);

        const sqljsDb = filename === ':memory:' ? new SQL.Database() : new SQL.Database();
        // Enable foreign keys
        sqljsDb.exec('PRAGMA foreign_keys = ON');
        this.db = new SqlJsDatabase(sqljsDb);
      }
      
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
      this.inTransaction = false;
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
      const insertId = typeof result.lastInsertRowid === 'number' ? result.lastInsertRowid : undefined;

      return {
        affectedRows: result.changes,
        ...(insertId !== undefined ? { insertId } : {}),
      };
    } catch (error) {
      console.error('SQLite execute error:', error);
      throw error;
    }
  }

  async beginTransaction(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    if (this.inTransaction) return;
    this.db.prepare('BEGIN').run();
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    if (!this.inTransaction) return;
    this.db.prepare('COMMIT').run();
    this.inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    if (!this.inTransaction) return;
    this.db.prepare('ROLLBACK').run();
    this.inTransaction = false;
  }

  getLastInsertId(): number {
    if (!this.db) throw new Error('Database not connected');
    const result = this.db.prepare('SELECT last_insert_rowid() as id').get() as { id: number } | undefined;
    return result?.id ?? 0;
  }

  // SQLite-specific method for direct access
  getDatabase(): SqliteDatabaseLike {
    if (!this.db) throw new Error('Database not connected');
    return this.db;
  }
}