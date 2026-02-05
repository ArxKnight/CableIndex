import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./src/test/vitest.setup.ts'],
    hookTimeout: 30000,
    testTimeout: 30000,
    typecheck: {
      tsconfig: './tsconfig.json'
    }
  },
});