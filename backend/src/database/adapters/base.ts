// Database adapter interface (MySQL-only)

import type { SslOptions } from 'mysql2';

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): boolean;
  isConnected(): boolean;
  query(sql: string, params?: any[]): Promise<any[]>;
  execute(sql: string, params?: any[]): Promise<{ insertId?: number; affectedRows: number }>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  getLastInsertId(): number | string;
}

export interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: string | SslOptions;
  connectionLimit?: number;
  queueLimit?: number;
}

export abstract class BaseDatabaseAdapter implements DatabaseAdapter {
  protected config: MySQLConfig;
  protected connected: boolean = false;

  constructor(config: MySQLConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract testConnection(): boolean;
  abstract query(sql: string, params?: any[]): Promise<any[]>;
  abstract execute(sql: string, params?: any[]): Promise<{ insertId?: number; affectedRows: number }>;
  abstract beginTransaction(): Promise<void>;
  abstract commit(): Promise<void>;
  abstract rollback(): Promise<void>;
  abstract getLastInsertId(): number | string;

  isConnected(): boolean {
    return this.connected;
  }
}