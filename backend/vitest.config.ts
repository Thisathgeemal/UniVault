import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Just below the figures on 24 Nov 2026 (88.58 / 85.34 / 93.04 / 89.14), rounded down.
      // Raise them when coverage improves; never lower them to make a change pass.
      thresholds: { statements: 88, branches: 85, functions: 93, lines: 89 },
    },
  },
});
