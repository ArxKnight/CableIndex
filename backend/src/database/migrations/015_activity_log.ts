import type { Migration } from './index.js';

export const Migration015_ActivityLog: Migration = {
  id: '015',
  name: 'activity_log',

  up: async (adapter) => {
    await adapter.execute(
      `CREATE TABLE activity_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        actor_user_id INT NOT NULL,
        site_id INT NULL,
        action VARCHAR(100) NOT NULL,
        summary VARCHAR(500) NOT NULL,
        metadata_json TEXT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_activity_log_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_activity_log_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_activity_log_actor_created ON activity_log(actor_user_id, created_at)');
    await adapter.execute('CREATE INDEX idx_activity_log_site_created ON activity_log(site_id, created_at)');
    await adapter.execute('CREATE INDEX idx_activity_log_created ON activity_log(created_at)');

    console.log('✅ Activity log table created successfully');
  },

  down: async (adapter) => {
    await adapter.execute('DROP TABLE IF EXISTS activity_log');
    console.log('✅ Activity log table dropped successfully');
  },
};
