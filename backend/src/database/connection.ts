import { DatabaseAdapter, MySQLConfig } from './adapters/base.js';
import { MySQLAdapter } from './adapters/mysql.js';

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private adapter: DatabaseAdapter | null = null;
  private config: MySQLConfig | null = null;

  private constructor() { }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async connect(config?: MySQLConfig): Promise<void> {
    try {
      if (!config) {
        console.log('🔄 Using default database configuration...');
        config = this.getEnvConfig();
      }

      console.log(`🔄 Connecting to MySQL database...`);
      this.config = config;

      console.log(`🔗 MySQL connection: ${config.host}:${config.port}/${config.database}`);
      this.adapter = new MySQLAdapter(config);

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

  public getConfig(): MySQLConfig | null {
    return this.config;
  }

  public isConnected(): boolean {
    return this.adapter ? this.adapter.isConnected() : false;
  }

  private getEnvConfig(): MySQLConfig {
    const requiredVars = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'] as const;
    const missing = requiredVars.filter((key) => process.env[key] === undefined);

    if (missing.length > 0) {
      const message =
        `Missing required MySQL environment variables: ${missing.join(', ')}. ` +
        `InfraDB now supports MySQL only.`;
      throw new Error(message);
    }

    const host = String(process.env.MYSQL_HOST);
    const database = String(process.env.MYSQL_DATABASE);
    const user = String(process.env.MYSQL_USER);
    const password = String(process.env.MYSQL_PASSWORD);

    const port = Number.parseInt(process.env.MYSQL_PORT || '3306', 10);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid MYSQL_PORT: ${process.env.MYSQL_PORT}`);
    }

    const sslEnabled = (process.env.MYSQL_SSL || '').toLowerCase() === 'true';

    const connectionLimitRaw = process.env.MYSQL_CONN_LIMIT;
    const queueLimitRaw = process.env.MYSQL_QUEUE_LIMIT;

    const parsedConnectionLimit = connectionLimitRaw ? Number.parseInt(connectionLimitRaw, 10) : undefined;
    const parsedQueueLimit = queueLimitRaw ? Number.parseInt(queueLimitRaw, 10) : undefined;

    const connectionLimit = Number.isFinite(parsedConnectionLimit) ? parsedConnectionLimit : undefined;
    const queueLimit = Number.isFinite(parsedQueueLimit) ? parsedQueueLimit : undefined;

    return {
      host,
      port,
      user,
      password,
      database,
      ...(sslEnabled ? { ssl: {} } : {}),
      ...(connectionLimit !== undefined ? { connectionLimit } : {}),
      ...(queueLimit !== undefined ? { queueLimit } : {}),
    };
  }
}

// Export singleton instance
const connection = DatabaseConnection.getInstance();
export default connection;