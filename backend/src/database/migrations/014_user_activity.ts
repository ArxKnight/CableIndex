import type { Migration } from './index.js';

export const Migration014_UserActivity: Migration = {
  id: '014',
  name: 'user_activity',

  up: async (adapter) => {
    await adapter.execute(
      `CREATE TABLE user_activity (
        user_id INT PRIMARY KEY,
        last_activity TIMESTAMP(3) NULL,
        last_login TIMESTAMP(3) NULL,
        CONSTRAINT fk_user_activity_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_user_activity_last_activity ON user_activity(last_activity)');
    await adapter.execute('CREATE INDEX idx_user_activity_last_login ON user_activity(last_login)');

    console.log('✅ User activity table created successfully');
  },

  down: async (adapter) => {
    await adapter.execute('DROP TABLE IF EXISTS user_activity');
    console.log('✅ User activity table dropped successfully');
  },
};
