// MySQL stub for development when mysql2 is not available
import { BaseDatabaseAdapter, DatabaseConfig } from './base.js';

export class MySQLAdapter extends BaseDatabaseAdapter {
  constructor(config: DatabaseConfig) {
    super(config);
    if (!config.mysql) {
      throw new Error('MySQL configuration is required');
    }
  }

  async connect(): Promise<void> {
    throw new Error('MySQL driver (mysql2) is not installed. This is a development stub.');
  }

  async disconnect(): Promise<void> {
    // No-op for stub
  }

  testConnection(): boolean {
    return false;
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    throw new Error('MySQL not available in development mode');
  }

  async execute(sql: string, params: any[] = []): Promise<{ insertId?: number; affectedRows: number }> {
    throw new Error('MySQL not available in development mode');
  }

  async beginTransaction(): Promise<void> {
    throw new Error('MySQL not available in development mode');
  }

  async commit(): Promise<void> {
    throw new Error('MySQL not available in development mode');
  }

  async rollback(): Promise<void> {
    throw new Error('MySQL not available in development mode');
  }

  getLastInsertId(): number {
    throw new Error('MySQL not available in development mode');
  }
}