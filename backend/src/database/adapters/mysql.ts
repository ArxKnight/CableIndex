// MySQL adapter with safe dynamic import
import { BaseDatabaseAdapter, DatabaseConfig } from './base.js';

export class MySQLAdapter extends BaseDatabaseAdapter {
  private connection: any = null;
  private pool: any = null;
  private mysql: any = null;

  constructor(config: DatabaseConfig) {
    super(config);
    if (!config.mysql) {
      throw new Error('MySQL configuration is required');
    }
  }

  async connect(): Promise<void> {
    try {
      // Dynamic import with error handling
      try {
        this.mysql = await import('mysql2/promise');
      } catch (importError) {
        throw new Error('MySQL driver (mysql2) is not installed. Please install mysql2 package.');
      }

      const mysqlConfig = this.config.mysql!;
      
      // Create connection pool for better performance
      this.pool = this.mysql.createPool({
        host: mysqlConfig.host,
        port: mysqlConfig.port,
        user: mysqlConfig.user,
        password: mysqlConfig.password,
        database: mysqlConfig.database,
        ssl: mysqlConfig.ssl,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        acquireTimeout: 60000,
        timeout: 60000,
      });

      // Test the connection
      this.connection = await this.pool.getConnection();
      await this.connection.ping();
      this.connection.release();

      this.connected = true;
      console.log(`✅ MySQL connected: ${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
    } catch (error) {
      console.error('❌ MySQL connection failed:', error);
      throw new Error(`Failed to connect to MySQL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connection = null;
      this.connected = false;
      console.log('✅ MySQL disconnected');
    }
  }

  testConnection(): boolean {
    return this.connected && this.pool !== null;
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.pool) throw new Error('Database not connected');
    
    try {
      const [rows] = await this.pool.execute(sql, params);
      return Array.isArray(rows) ? rows : [rows];
    } catch (error) {
      console.error('MySQL query error:', error);
      throw error;
    }
  }

  async execute(sql: string, params: any[] = []): Promise<{ insertId?: number; affectedRows: number }> {
    if (!this.pool) throw new Error('Database not connected');
    
    try {
      const [result] = await this.pool.execute(sql, params);
      const mysqlResult = result as any;
      return {
        insertId: mysqlResult.insertId,
        affectedRows: mysqlResult.affectedRows
      };
    } catch (error) {
      console.error('MySQL execute error:', error);
      throw error;
    }
  }

  async beginTransaction(): Promise<void> {
    if (!this.pool) throw new Error('Database not connected');
    this.connection = await this.pool.getConnection();
    await this.connection.beginTransaction();
  }

  async commit(): Promise<void> {
    if (!this.connection) throw new Error('No active transaction');
    await this.connection.commit();
    this.connection.release();
    this.connection = null;
  }

  async rollback(): Promise<void> {
    if (!this.connection) throw new Error('No active transaction');
    await this.connection.rollback();
    this.connection.release();
    this.connection = null;
  }

  getLastInsertId(): number {
    // MySQL returns insertId from execute result
    throw new Error('Use the insertId from execute() result instead');
  }

  // MySQL-specific method for direct pool access
  getPool(): any {
    if (!this.pool) throw new Error('Database not connected');
    return this.pool;
  }
}