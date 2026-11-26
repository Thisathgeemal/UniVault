import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { claimsValidators } from './claims-validators-plugin.js';
import { contentSecurityPolicy } from './csp.js';

export const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

/** Adds the Content-Security-Policy <meta> tag to index.html in production builds only. */
function cspMetaTag(apiBaseUrl: string): Plugin {
  return {
    name: 'univault-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: contentSecurityPolicy(apiBaseUrl),
        },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBaseUrl = env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  return {
    plugins: [react(), tailwindcss(), claimsValidators(), cspMetaTag(apiBaseUrl)],
    // portal-ui is linked (file:../portal-ui) and has its own React for its tests: always use one
    resolve: { dedupe: ['react', 'react-dom'] },
    // The linked claims-validation package's CommonJS runtime helpers (ajv, ajv-formats) are
    // not under the portal's node_modules, so name them for pre-bundling (dev server)
    optimizeDeps: {
      include: [
        '@univault/claims-validation > ajv/dist/runtime/ucs2length.js',
        '@univault/claims-validation > ajv-formats/dist/formats.js',
        // portal-ui's QR encoder (CommonJS)
        '@univault/portal-ui > qrcode',
      ],
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      // No data: URIs for assets (fonts stay files, served from 'self')
      assetsInlineLimit: 0,
      sourcemap: false,
      // Libraries change less often than the app: separate chunks stay cached across releases
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 3,
              },
              { name: 'router', test: /node_modules[\\/]react-router[\\/]/, priority: 2 },
              { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
            ],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['test/**/*.test.{ts,tsx}'],
      setupFiles: ['test/setup.ts'],
      // MSW intercepts fetch; requests must never reach a real backend
      env: { VITE_API_BASE_URL: DEFAULT_API_BASE_URL },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/vite-env.d.ts'],
        reporter: ['text', 'html', 'json-summary'],
        reportsDirectory: 'coverage',
        // Just below the figures on 25 Nov 2026 (96.86 / 91.84 / 97.80 / 98.80), rounded down.
        // Raise them when coverage improves; never lower them to make a change pass.
        thresholds: { statements: 96, branches: 91, functions: 97, lines: 98 },
      },
    },
  };
});
