import type { Migration } from './index.js';
import { columnExists, indexExists, tableExists } from './schemaChecks.js';

export const Migration006_CableTypes: Migration = {
  id: '006',
  name: 'cable_types',

  up: async (adapter) => {
    const hasCableTypes = await tableExists(adapter, 'cable_types');
    if (!hasCableTypes) {
      await adapter.execute(
        `CREATE TABLE cable_types (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_cable_types_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          UNIQUE KEY unique_site_cable_type_name (site_id, name)
        ) ENGINE=InnoDB`
      );
    }

    if (!(await indexExists(adapter, 'idx_cable_types_site_id'))) {
      try {
        await adapter.execute('CREATE INDEX idx_cable_types_site_id ON cable_types(site_id)');
      } catch {
        // best-effort
      }
    }

    const hasCableTypeId = await columnExists(adapter, 'labels', 'cable_type_id');
    if (!hasCableTypeId) {
      await adapter.execute('ALTER TABLE labels ADD COLUMN cable_type_id INT');
    }

    if (!(await indexExists(adapter, 'idx_labels_cable_type_id'))) {
      try {
        await adapter.execute('CREATE INDEX idx_labels_cable_type_id ON labels(cable_type_id)');
      } catch {
        // best-effort
      }
    }

    // Best-effort FK; may fail depending on engine/constraints.
    try {
      await adapter.execute(
        'ALTER TABLE labels ADD CONSTRAINT fk_labels_cable_type FOREIGN KEY (cable_type_id) REFERENCES cable_types(id) ON DELETE SET NULL'
      );
    } catch {
      // ignore
    }
  },

  down: async (adapter) => {
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

    try {
      await adapter.execute('DROP TABLE IF EXISTS cable_types');
    } catch {
      // ignore
    }
  },
};
