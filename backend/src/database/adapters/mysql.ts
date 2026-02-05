import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import mysql from 'mysql2/promise';
import { BaseDatabaseAdapter, MySQLConfig } from './base.js';

export class MySQLAdapter extends BaseDatabaseAdapter {
  private connection: PoolConnection | null = null;
  private pool: Pool | null = null;

  constructor(config: MySQLConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    try {
      const mysqlConfig = this.config;
      
      // First, try to connect to the database
      try {
        // Create connection pool for better performance
        this.pool = mysql.createPool({
          host: mysqlConfig.host,
          port: mysqlConfig.port,
          user: mysqlConfig.user,
          password: mysqlConfig.password,
          database: mysqlConfig.database,
          ...(mysqlConfig.ssl ? { ssl: mysqlConfig.ssl } : {}),
          waitForConnections: true,
          connectionLimit: mysqlConfig.connectionLimit ?? 10,
          queueLimit: mysqlConfig.queueLimit ?? 0,
          timezone: 'Z',
        });

        // Test the connection
        this.connection = await this.pool.getConnection();
        await this.connection.ping();
        this.connection.release();

        this.connected = true;
        console.log(`✅ MySQL connected: ${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
      } catch (error: any) {
        // If database doesn't exist, create it
        if (error.errno === 1049 || error.code === 'ER_BAD_DB_ERROR') {
          console.log(`📦 Database '${mysqlConfig.database}' does not exist. Creating...`);
          
          // Connect without specifying a database
          const tempPool = mysql.createPool({
            host: mysqlConfig.host,
            port: mysqlConfig.port,
            user: mysqlConfig.user,
            password: mysqlConfig.password,
            ...(mysqlConfig.ssl ? { ssl: mysqlConfig.ssl } : {}),
            waitForConnections: true,
            connectionLimit: mysqlConfig.connectionLimit ?? 10,
            queueLimit: mysqlConfig.queueLimit ?? 0,
            timezone: 'Z',
          });

          try {
            const tempConn = await tempPool.getConnection();
            // Create the database
            await tempConn.query(
              `CREATE DATABASE IF NOT EXISTS \`${mysqlConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
            );
            tempConn.release();
            await tempPool.end();
            
            console.log(`✅ Database '${mysqlConfig.database}' created successfully`);

            // Now connect to the newly created database
            this.pool = mysql.createPool({
              host: mysqlConfig.host,
              port: mysqlConfig.port,
              user: mysqlConfig.user,
              password: mysqlConfig.password,
              database: mysqlConfig.database,
              ...(mysqlConfig.ssl ? { ssl: mysqlConfig.ssl } : {}),
              waitForConnections: true,
              connectionLimit: mysqlConfig.connectionLimit ?? 10,
              queueLimit: mysqlConfig.queueLimit ?? 0,
              timezone: 'Z',
            });

            this.connection = await this.pool.getConnection();
            await this.connection.ping();
            this.connection.release();

            this.connected = true;
            console.log(`✅ MySQL connected: ${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
          } catch (createError) {
            await tempPool.end();
            throw createError;
          }
        } else {
          throw error;
        }
      }
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
      const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params);
      return Array.isArray(rows) ? rows : [rows as any];
    } catch (error) {
      console.error('MySQL query error:', error);
      throw error;
    }
  }

  async execute(sql: string, params: any[] = []): Promise<{ insertId?: number; affectedRows: number }> {
    if (!this.pool) throw new Error('Database not connected');
    
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(sql, params);
      const mysqlResult = result as ResultSetHeader;
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