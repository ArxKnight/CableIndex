import type { Migration } from './index.js';
import { indexExists, tableExists } from './schemaChecks.js';

export const Migration017_SidIndex: Migration = {
  id: '017',
  name: 'sid_index',

  up: async (adapter) => {
    if (!(await tableExists(adapter, 'sid_types'))) {
      await adapter.execute(
        `CREATE TABLE sid_types (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_types_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          UNIQUE KEY unique_site_sid_type_name (site_id, name)
        ) ENGINE=InnoDB`
      );
    }

    if (!(await tableExists(adapter, 'sid_device_models'))) {
      await adapter.execute(
        `CREATE TABLE sid_device_models (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          manufacturer VARCHAR(255) NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_device_models_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          UNIQUE KEY unique_site_device_model_name (site_id, name)
        ) ENGINE=InnoDB`
      );
    }

    if (!(await tableExists(adapter, 'sid_cpu_models'))) {
      await adapter.execute(
        `CREATE TABLE sid_cpu_models (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          manufacturer VARCHAR(255) NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_cpu_models_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          UNIQUE KEY unique_site_cpu_model_name (site_id, name)
        ) ENGINE=InnoDB`
      );
    }

    if (!(await tableExists(adapter, 'site_vlans'))) {
      await adapter.execute(
        `CREATE TABLE site_vlans (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          vlan_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_site_vlans_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          UNIQUE KEY unique_site_vlan_id (site_id, vlan_id)
        ) ENGINE=InnoDB`
      );
    }

    if (!(await tableExists(adapter, 'sids'))) {
      await adapter.execute(
        `CREATE TABLE sids (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          sid_number VARCHAR(64) NOT NULL,
          sid_type_id INT NULL,
          device_model_id INT NULL,
          cpu_model_id INT NULL,
          hostname VARCHAR(255) NULL,
          serial_number VARCHAR(255) NULL,
          asset_tag VARCHAR(255) NULL,
          status VARCHAR(64) NULL,

          -- Hardware
          cpu_count INT NULL,
          cpu_cores INT NULL,
          cpu_threads INT NULL,
          ram_gb INT NULL,

          -- Software
          os_name VARCHAR(255) NULL,
          os_version VARCHAR(255) NULL,

          -- Networking (basic)
          mgmt_ip VARCHAR(64) NULL,
          mgmt_mac VARCHAR(64) NULL,

          -- Location
          location_id INT NULL,

          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

          CONSTRAINT fk_sids_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          CONSTRAINT fk_sids_sid_type_id FOREIGN KEY (sid_type_id) REFERENCES sid_types(id) ON DELETE SET NULL,
          CONSTRAINT fk_sids_device_model_id FOREIGN KEY (device_model_id) REFERENCES sid_device_models(id) ON DELETE SET NULL,
          CONSTRAINT fk_sids_cpu_model_id FOREIGN KEY (cpu_model_id) REFERENCES sid_cpu_models(id) ON DELETE SET NULL,
          CONSTRAINT fk_sids_location_id FOREIGN KEY (location_id) REFERENCES site_locations(id) ON DELETE SET NULL,
          UNIQUE KEY unique_site_sid_number (site_id, sid_number)
        ) ENGINE=InnoDB`
      );
    }

    if (!(await tableExists(adapter, 'sid_notes'))) {
      await adapter.execute(
        `CREATE TABLE sid_notes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sid_id INT NOT NULL,
          created_by INT NOT NULL,
          type VARCHAR(16) NOT NULL DEFAULT 'NOTE',
          note_text TEXT NOT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_notes_sid_id FOREIGN KEY (sid_id) REFERENCES sids(id) ON DELETE CASCADE,
          CONSTRAINT fk_sid_notes_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB`
      );
    }

    if (!(await tableExists(adapter, 'sid_nics'))) {
      await adapter.execute(
        `CREATE TABLE sid_nics (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sid_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          mac_address VARCHAR(64) NULL,
          ip_address VARCHAR(64) NULL,
          site_vlan_id INT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_nics_sid_id FOREIGN KEY (sid_id) REFERENCES sids(id) ON DELETE CASCADE,
          CONSTRAINT fk_sid_nics_site_vlan_id FOREIGN KEY (site_vlan_id) REFERENCES site_vlans(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`
      );
    }

    if (!(await tableExists(adapter, 'sid_connections'))) {
      await adapter.execute(
        `CREATE TABLE sid_connections (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_id INT NOT NULL,
          sid_id INT NOT NULL,
          nic_id INT NULL,
          switch_sid_id INT NOT NULL,
          switch_port VARCHAR(255) NOT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          CONSTRAINT fk_sid_connections_site_id FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
          CONSTRAINT fk_sid_connections_sid_id FOREIGN KEY (sid_id) REFERENCES sids(id) ON DELETE CASCADE,
          CONSTRAINT fk_sid_connections_nic_id FOREIGN KEY (nic_id) REFERENCES sid_nics(id) ON DELETE SET NULL,
          CONSTRAINT fk_sid_connections_switch_sid_id FOREIGN KEY (switch_sid_id) REFERENCES sids(id) ON DELETE RESTRICT,
          UNIQUE KEY unique_switch_port_in_site (site_id, switch_sid_id, switch_port)
        ) ENGINE=InnoDB`
      );
    }

    // Indices (best-effort)
    if (!(await indexExists(adapter, 'idx_sids_site_id'))) {
      try {
        await adapter.execute('CREATE INDEX idx_sids_site_id ON sids(site_id)');
      } catch {
        // ignore
      }
    }
    if (!(await indexExists(adapter, 'idx_sids_sid_number'))) {
      try {
        await adapter.execute('CREATE INDEX idx_sids_sid_number ON sids(sid_number)');
      } catch {
        // ignore
      }
    }
    if (!(await indexExists(adapter, 'idx_sids_hostname'))) {
      try {
        await adapter.execute('CREATE INDEX idx_sids_hostname ON sids(hostname)');
      } catch {
        // ignore
      }
    }
    if (!(await indexExists(adapter, 'idx_sid_notes_sid_id'))) {
      try {
        await adapter.execute('CREATE INDEX idx_sid_notes_sid_id ON sid_notes(sid_id)');
      } catch {
        // ignore
      }
    }
    if (!(await indexExists(adapter, 'idx_sid_nics_sid_id'))) {
      try {
        await adapter.execute('CREATE INDEX idx_sid_nics_sid_id ON sid_nics(sid_id)');
      } catch {
        // ignore
      }
    }
    if (!(await indexExists(adapter, 'idx_sid_connections_sid_id'))) {
      try {
        await adapter.execute('CREATE INDEX idx_sid_connections_sid_id ON sid_connections(sid_id)');
      } catch {
        // ignore
      }
    }
  },

  down: async (adapter) => {
    // Drop in reverse dependency order
    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_connections');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_nics');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_notes');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('DROP TABLE IF EXISTS sids');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('DROP TABLE IF EXISTS site_vlans');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_cpu_models');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_device_models');
    } catch {
      // ignore
    }
    try {
      await adapter.execute('DROP TABLE IF EXISTS sid_types');
    } catch {
      // ignore
    }
  },
};
