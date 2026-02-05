// Test setup helpers
import { beforeAll, afterAll } from 'vitest';
import connection from '../database/connection.js';
import { initializeDatabase, InitOptions } from '../database/init.js';
import { DatabaseAdapter } from '../database/adapters/base.js';

export async function setupTestDatabase(options: InitOptions = {}): Promise<DatabaseAdapter> {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DATABASE_PATH = ':memory:';

  await connection.connect({
    type: 'sqlite',
    sqlite: { filename: ':memory:' },
  });

  await initializeDatabase({
    runMigrations: options.runMigrations ?? true,
    seedData: options.seedData ?? false,
  });

  return connection.getAdapter();
}

export async function cleanupTestDatabase(): Promise<void> {
  await connection.disconnect();
}

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DATABASE_PATH = ':memory:';
});

afterAll(async () => {
  await connection.disconnect();
});