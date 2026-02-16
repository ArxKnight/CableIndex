import type { Migration } from './index.js';

export const Migration016_PasswordResetTokens: Migration = {
  id: '016',
  name: 'Password reset tokens',

  up: async (adapter) => {
    await adapter.execute(
      `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP(3) NOT NULL,
        used_at TIMESTAMP(3) NULL,
        created_by_user_id INT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_password_reset_tokens_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_password_reset_tokens_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`
    );

    await adapter.execute('CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id)');
    await adapter.execute('CREATE INDEX idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash)');
    await adapter.execute('CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at)');
  },

  down: async (adapter) => {
    await adapter.execute('DROP TABLE IF EXISTS password_reset_tokens');
  },
};
