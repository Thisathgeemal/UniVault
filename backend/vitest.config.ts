import { defineConfig } from 'vitest/config';

/**
 * Two projects, one combined run and one coverage report (Sprint 1, Issue 15):
 *
 * - fast:  in-process tests (supertest, in-memory PGlite). Files run in parallel.
 * - heavy: tests that start real processes (server, CLI, git) or use PGlite ON DISK. They run
 *          AFTER the fast project (sequence.groupOrder) and one file at a time, so they never
 *          compete for CPU and disk. Under parallel load on Windows they took 3–10× longer
 *          and timed out.
 *
 * A new test file that spawns a process or opens pglite://<folder> belongs in HEAVY_TESTS.
 * Each heavy test sets its own timeout; the defaults below are not raised for them.
 */
const HEAVY_TESTS = [
  'test/server.test.ts',
  'test/key-startup.test.ts',
  'test/check-secrets.test.ts',
  'test/db/seed-disk.test.ts',
];

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'fast',
          include: ['test/**/*.test.ts'],
          exclude: HEAVY_TESTS,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'heavy',
          include: HEAVY_TESTS,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Just below the figures on 25 Nov 2026 (90.08 / 86.26 / 93.79 / 90.65), rounded down.
      // Raise them when coverage improves; never lower them to make a change pass.
      thresholds: { statements: 90, branches: 86, functions: 93, lines: 90 },
    },
  },
});
