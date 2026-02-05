import type { Migration } from './index.js';
import connection from '../connection.js';
import { columnExists, indexExists, tableExists } from './schemaChecks.js';

export const Migration006_CableTypes: Migration = {
  id: '006',
  name: 'cable_types',

  up: async (adapter) => {
    const config = connection.getConfig();
    const dbType = (config?.type || 'sqlite') as any;
    const isMySQL = config?.type === 'mysql';
    const getSQL = (sqlite: string, mysql: string) => (isMySQL ? mysql : sqlite);

    const hasCableTypes = await tableExists(adapter, 'cable_types', dbType);
    if (!hasCableTypes) {
      await adapter.execute(
        getSQL(
          `CREATE TABLE cable_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
            UNIQUE(site_id, name)
          )`,
          `CREATE TABLE cable_types (
            id INT AUTO_INCREMENT PRIMARY KEY,
            site_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
            UNIQUE KEY unique_site_cable_type_name (site_id, name)
          )`
        )
      );
    }

    if (!(await indexExists(adapter, 'idx_cable_types_site_id', dbType))) {
      try {
        await adapter.execute('CREATE INDEX idx_cable_types_site_id ON cable_types(site_id)');
      } catch {
        // best-effort
      }
    }

    const hasCableTypeId = await columnExists(adapter, 'labels', 'cable_type_id', dbType);
    if (!hasCableTypeId) {
      await adapter.execute(
        getSQL(
          'ALTER TABLE labels ADD COLUMN cable_type_id INTEGER',
          'ALTER TABLE labels ADD COLUMN cable_type_id INT'
        )
      );
    }

    if (!(await indexExists(adapter, 'idx_labels_cable_type_id', dbType))) {
      try {
        await adapter.execute('CREATE INDEX idx_labels_cable_type_id ON labels(cable_type_id)');
      } catch {
        // best-effort
      }
    }

    if (isMySQL) {
      // Best-effort FK; may fail depending on engine/constraints.
      try {
        await adapter.execute(
          'ALTER TABLE labels ADD CONSTRAINT fk_labels_cable_type FOREIGN KEY (cable_type_id) REFERENCES cable_types(id) ON DELETE SET NULL'
        );
      } catch {
        // ignore
      }
    }
  },

  down: async (adapter) => {
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';

    // SQLite cannot reliably drop columns.
    if (isMySQL) {
      try {
        await adapter.execute('ALTER TABLE labels DROP FOREIGN KEY fk_labels_cable_type');
      } catch {
        // ignore
      }

      try {
        await adapter.execute('ALTER TABLE labels DROP COLUMN cable_type_id');
      } catch {
        // ignore
      }
    }

    try {
      await adapter.execute('DROP TABLE IF EXISTS cable_types');
    } catch {
      // ignore
    }
  },
};
