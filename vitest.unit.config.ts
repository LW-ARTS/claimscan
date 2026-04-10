import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['lib/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'e2e', '.next', 'bot', 'lib/__tests__/integration/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
