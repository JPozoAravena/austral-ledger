import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: { name: 'fast', include: ['test/unit/**/*.spec.ts', 'test/e2e/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/worker.ts', 'src/infra/db/migrate.ts'],
      thresholds: { 'src/domain/**': { lines: 90, branches: 90 } },
    },
  },
});
