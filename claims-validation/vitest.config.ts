import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Just below the first figures (26 Nov 2026: 98.48 / 89.83 / 100 / 98.41). The open
      // branches are the CommonJS interop fallbacks for bundlers (runtime.ts) and the
      // "unexpected require()" guard. Raise when coverage improves; never lower them.
      thresholds: { statements: 98, branches: 89, functions: 100, lines: 98 },
    },
  },
});
