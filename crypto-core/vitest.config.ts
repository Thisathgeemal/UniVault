import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // The run fails if coverage drops below these levels
      thresholds: { statements: 95, branches: 90, functions: 100, lines: 95 },
    },
  },
});
