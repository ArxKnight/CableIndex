import type { Migration } from './index.js';

export const Migration010_NormalizeLegacyRoles: Migration = {
  id: '010',
  name: 'normalize_legacy_roles',
  up: async (adapter) => {
    // Normalize any legacy role strings that may exist from older deployments.
    // Global roles
    await adapter.execute(
      `UPDATE users
       SET role = 'GLOBAL_ADMIN'
       WHERE UPPER(role) = 'ADMIN'`,
    );

    // Site membership roles
    await adapter.execute(
      `UPDATE site_memberships
       SET site_role = 'SITE_ADMIN'
       WHERE UPPER(site_role) = 'ADMIN'`,
    );
    await adapter.execute(
      `UPDATE site_memberships
       SET site_role = 'SITE_USER'
       WHERE UPPER(site_role) = 'USER'`,
    );

    // Invitation site roles
    await adapter.execute(
      `UPDATE invitation_sites
       SET site_role = 'SITE_ADMIN'
       WHERE UPPER(site_role) = 'ADMIN'`,
    );
    await adapter.execute(
      `UPDATE invitation_sites
       SET site_role = 'SITE_USER'
       WHERE UPPER(site_role) = 'USER'`,
    );
  },
  down: async (_adapter) => {
    // Non-destructive migration; no rollback.
  },
};
