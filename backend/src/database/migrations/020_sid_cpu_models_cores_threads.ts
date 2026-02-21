import type { DatabaseAdapter } from '../adapters/base.js';

export const Migration020_SidCpuModelsCoresThreads = {
  id: '020',
  name: 'sid_cpu_models_cores_threads',

  up: async (adapter: DatabaseAdapter) => {
    await adapter.execute(
      `ALTER TABLE sid_cpu_models
       ADD COLUMN cpu_cores INT NULL,
       ADD COLUMN cpu_threads INT NULL`
    );

    console.log('✅ Migration 020 applied: sid_cpu_models cpu_cores/cpu_threads');
  },

  down: async (adapter: DatabaseAdapter) => {
    await adapter.execute(
      `ALTER TABLE sid_cpu_models
       DROP COLUMN cpu_cores,
       DROP COLUMN cpu_threads`
    );

    console.log('✅ Migration 020 rolled back: sid_cpu_models cpu_cores/cpu_threads');
  },
};
