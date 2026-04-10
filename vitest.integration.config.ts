import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['lib/__tests__/integration/**/*.test.ts'],
    exclude: ['node_modules'],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    retry: 2,
    sequence: { concurrent: false },
    fileParallelism: false,
    setupFiles: ['lib/__tests__/integration/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
