import type { Migration } from './index.js';
import connection from '../connection.js';

export const Migration005_SiteLocations: Migration = {
  id: '005',
  name: 'site_locations_and_structured_label_locations',

  up: async (adapter) => {
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    const getSQL = (sqlite: string, mysql: string) => (isMySQL ? mysql : sqlite);

    // Create site_locations table
    await adapter.execute(
      getSQL(
        `CREATE TABLE IF NOT EXISTS site_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          site_id INTEGER NOT NULL,
          floor TEXT NOT NULL,
          suite TEXT NOT NULL,
          \`row\` TEXT NOT NULL,
          rack TEXT NOT NULL,
          label TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS site_locations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          floor VARCHAR(50) NOT NULL,
          suite VARCHAR(50) NOT NULL,
          \`row\` VARCHAR(50) NOT NULL,
          rack VARCHAR(50) NOT NULL,
          label VARCHAR(255) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        )`
      )
    );

    // Helpful indexes / uniqueness for location coordinates within a site
    try {
      await adapter.execute('CREATE INDEX idx_site_locations_site_id ON site_locations(site_id)');
    } catch {
      // ignore
    }

    try {
      await adapter.execute(
        getSQL(
          'CREATE UNIQUE INDEX idx_site_locations_unique_coords ON site_locations(site_id, floor, suite, `row`, rack)',
          'CREATE UNIQUE INDEX idx_site_locations_unique_coords ON site_locations(site_id, floor, suite, `row`, rack)'
        )
      );
    } catch {
      // ignore
    }

    // Add structured location columns to labels
    try {
      await adapter.execute(
        getSQL(
          'ALTER TABLE labels ADD COLUMN source_location_id INTEGER',
          'ALTER TABLE labels ADD COLUMN source_location_id INT'
        )
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute(
        getSQL(
          'ALTER TABLE labels ADD COLUMN destination_location_id INTEGER',
          'ALTER TABLE labels ADD COLUMN destination_location_id INT'
        )
      );
    } catch {
      // ignore
    }

    try {
      await adapter.execute('CREATE INDEX idx_labels_source_location_id ON labels(source_location_id)');
    } catch {
      // ignore
    }

    try {
      await adapter.execute('CREATE INDEX idx_labels_destination_location_id ON labels(destination_location_id)');
    } catch {
      // ignore
    }

    // MySQL-only: add foreign key constraints (best-effort)
    if (isMySQL) {
      try {
        await adapter.execute(
          'ALTER TABLE labels ADD CONSTRAINT fk_labels_source_location FOREIGN KEY (source_location_id) REFERENCES site_locations(id) ON DELETE SET NULL'
        );
      } catch {
        // ignore
      }

      try {
        await adapter.execute(
          'ALTER TABLE labels ADD CONSTRAINT fk_labels_destination_location FOREIGN KEY (destination_location_id) REFERENCES site_locations(id) ON DELETE SET NULL'
        );
      } catch {
        // ignore
      }
    }
  },

  down: async (adapter) => {
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';

    // SQLite cannot reliably drop columns; keep best-effort rollback.
    if (isMySQL) {
      try {
        await adapter.execute('ALTER TABLE labels DROP FOREIGN KEY fk_labels_source_location');
      } catch {
        // ignore
      }
      try {
        await adapter.execute('ALTER TABLE labels DROP FOREIGN KEY fk_labels_destination_location');
      } catch {
        // ignore
      }

      try {
        await adapter.execute('ALTER TABLE labels DROP COLUMN source_location_id');
      } catch {
        // ignore
      }

      try {
        await adapter.execute('ALTER TABLE labels DROP COLUMN destination_location_id');
      } catch {
        // ignore
      }
    }

    try {
      await adapter.execute('DROP TABLE IF EXISTS site_locations');
    } catch {
      // ignore
    }
  },
};
