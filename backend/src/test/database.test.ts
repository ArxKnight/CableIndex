import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';
import { runMigrations, getMigrationStatus } from '../database/migrations/index.js';
import { setupTestDatabase, cleanupTestDatabase } from './setup.js';

describe('Database (MySQL)', () => {
  beforeEach(async () => {
    await setupTestDatabase({ runMigrations: true, seedData: false });
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  it('connects successfully', () => {
    expect(connection.isConnected()).toBe(true);
    expect(connection.testConnection()).toBe(true);
  });

  it('initializes the migrations table', async () => {
    await initializeDatabase({ runMigrations: true, seedData: false });

    const adapter = connection.getAdapter();
    const config = connection.getConfig();
    expect(config).toBeDefined();

    const rows = await adapter.query(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1',
      [config!.database, 'migrations'],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('runs migrations and reports applied status', async () => {
    await runMigrations();
    const status = await getMigrationStatus();
    expect(status.length).toBeGreaterThan(0);
    expect(status.every((m) => m.applied)).toBe(true);
  });

  it('can seed initial data', async () => {
    await initializeDatabase({ runMigrations: true, seedData: true });

    const adapter = connection.getAdapter();
    const userCountRows = await adapter.query('SELECT COUNT(*) as count FROM users');
    expect(Number((userCountRows[0] as any).count)).toBeGreaterThan(0);

    const settingsCountRows = await adapter.query('SELECT COUNT(*) as count FROM app_settings');
    expect(Number((settingsCountRows[0] as any).count)).toBeGreaterThan(0);
  });
});