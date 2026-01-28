import { DatabaseAdapter, DatabaseConfig } from './adapters/base.js';
import { SQLiteAdapter } from './adapters/sqlite.js';
import path from 'path';

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private adapter: DatabaseAdapter | null = null;
  private config: DatabaseConfig | null = null;

  private constructor() { }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async connect(config?: DatabaseConfig): Promise<void> {
    try {
      if (!config) {
        console.log('🔄 Using default database configuration...');
        config = this.getDefaultConfig();
      }

      console.log(`🔄 Connecting to ${config.type} database...`);
      this.config = config;

      // Create appropriate adapter based on database type
      switch (config.type) {
        case 'sqlite':
          console.log(`📂 SQLite database path: ${config.sqlite?.filename}`);
          this.adapter = new SQLiteAdapter(config);
          break;
        case 'mysql':
          try {
            console.log(`🔗 MySQL connection: ${config.mysql?.host}:${config.mysql?.port}/${config.mysql?.database}`);
            // Try to import the real MySQL adapter
            const { MySQLAdapter } = await import('./adapters/mysql.js');
            this.adapter = new MySQLAdapter(config);
          } catch (error) {
            // Fall back to stub if mysql2 is not available
            console.error('❌ MySQL driver not available:', error);
            console.warn('⚠️  Falling back to stub. Install mysql2 for MySQL support.');
            const { MySQLAdapter: MySQLStub } = await import('./adapters/mysql-stub.js');
            this.adapter = new MySQLStub(config);
          }
          break;
        default:
          throw new Error(`Unsupported database type: ${(config as any).type}`);
      }

      await this.adapter.connect();
      console.log('✅ Database adapter connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
      this.config = null;
    }
  }

  /**
   * Reset the connection - disconnects current adapter and clears config
   * Used when database configuration changes (e.g., after setup completes)
   */
  public async reset(): Promise<void> {
    console.log('🔄 Resetting database connection...');
    await this.disconnect();
    this.adapter = null;
    this.config = null;
  }

  public getAdapter(): DatabaseAdapter {
    if (!this.adapter) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.adapter;
  }

  public testConnection(): boolean {
    return this.adapter ? this.adapter.testConnection() : false;
  }

  public getConfig(): DatabaseConfig | null {
    return this.config;
  }

  public isConnected(): boolean {
    return this.adapter ? this.adapter.isConnected() : false;
  }

  // Legacy method for backward compatibility with SQLite-specific code
  public getConnection(): any {
    if (!this.adapter) {
      throw new Error('Database not connected. Call connect() first.');
    }

    // For SQLite, return the direct database instance
    if (this.config?.type === 'sqlite') {
      const sqliteAdapter = this.adapter as any;
      if (sqliteAdapter.getDatabase) {
        return sqliteAdapter.getDatabase();
      }
    }

    // For MySQL, return the adapter itself
    return this.adapter;
  }

  private getDefaultConfig(): DatabaseConfig {
    // Check if MySQL config is provided via environment variables
    if (process.env.DB_TYPE === 'mysql' || process.env.MYSQL_HOST) {
      return {
        type: 'mysql',
        mysql: {
          host: process.env.MYSQL_HOST || 'localhost',
          port: parseInt(process.env.MYSQL_PORT || '3306'),
          user: process.env.MYSQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || '',
          database: process.env.MYSQL_DATABASE || 'cableindex',
          ssl: process.env.MYSQL_SSL === 'true',
        }
      };
    }

    // Default to SQLite
    return {
      type: 'sqlite',
      sqlite: {
        filename: process.env.DATABASE_PATH || path.join('/app', 'data', 'cableindex.db'),
      }
    };
  }
}

// Export singleton instance
const connection = DatabaseConnection.getInstance();
export default connection;