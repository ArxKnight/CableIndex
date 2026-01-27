import fs from 'fs';
import path from 'path';
import connection from '../database/connection.js';

const SETUP_MARKER_PATH = path.join('/app', 'data', '.setup-complete');

/**
 * Determine if setup has been completed using env flag, marker file, or DB check.
 * Sets process.env.SETUP_COMPLETE when any signal confirms completion.
 */
export async function isSetupComplete(): Promise<boolean> {
  if (process.env.SETUP_COMPLETE === 'true') {
    return true;
  }

  if (fs.existsSync(SETUP_MARKER_PATH)) {
    process.env.SETUP_COMPLETE = 'true';
    return true;
  }

  // Only attempt a DB probe if we have any database configuration hints
  const hasDbConfig = Boolean(
    process.env.DB_TYPE ||
    process.env.MYSQL_HOST ||
    process.env.MYSQL_DATABASE ||
    (process.env.DATABASE_PATH && fs.existsSync(process.env.DATABASE_PATH))
  );

  if (!hasDbConfig) {
    return false;
  }

  try {
    // Connect if not already connected so we can inspect users
    if (!connection.isConnected()) {
      await connection.connect();
    }

    // If the users table doesn't exist yet, setup is not complete
    if (!(await usersTableExists())) {
      return false;
    }

    const { default: UserModel } = await import('../models/User.js');
    const userModel = new UserModel();
    const userCount = await userModel.count();
    const complete = userCount > 0;

    if (complete) {
      console.log('✅ Setup detected via database user check');
      process.env.SETUP_COMPLETE = 'true';
    }

    return complete;
  } catch (err) {
    // Avoid failing requests if DB probe is not possible
    console.debug('Setup completion DB probe failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export const setupMarkerPath = SETUP_MARKER_PATH;

async function usersTableExists(): Promise<boolean> {
  try {
    const adapter = connection.getAdapter();
    const config = connection.getConfig();

    if (!config) {
      return false;
    }

    if (config.type === 'mysql') {
      const dbName = config.mysql?.database || 'wireindex';
      const rows = await adapter.query(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1',
        [dbName, 'users']
      );
      return rows.length > 0;
    }

    // sqlite fallback
    const rows = await adapter.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    return rows.length > 0;
  } catch (err) {
    console.debug('User table existence check failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
