import { defineConfig } from 'vitest/config';
import path from 'path';
import BenchReporter from './scripts/bench-reporter';

export default defineConfig({
  test: {
    name: 'bench',
    environment: 'node',
    reporters: ['default', new BenchReporter()],
    benchmark: {
      include: ['scripts/bench-adapters.bench.ts'],
      outputJson: '.bench-results.json',
    },
    setupFiles: ['lib/__tests__/helpers/mocks.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
