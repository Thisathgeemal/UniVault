import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.tsx'],
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Just below the figures on 24 Nov 2026 (100 / 94 / 100 / 100), rounded down.
      // Raise them when coverage improves; never lower them to make a change pass.
      thresholds: { statements: 99, branches: 93, functions: 99, lines: 99 },
    },
  },
});
