import { DatabaseAdapter } from '../adapters/base.js';

export async function up(adapter: DatabaseAdapter): Promise<void> {
  console.log('Skipping deprecated migration: 004_add_fullname_to_invitations');
}

export async function down(adapter: DatabaseAdapter): Promise<void> {
  console.log('No-op rollback for deprecated migration: 004_add_fullname_to_invitations');
}
