// @ts-check
// Root ESLint flat config (ESLint 9) shared by all JS/TS packages in the monorepo.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const JS_TS = '**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}';
// React web packages: the two portals and their shared layout package
const REACT_PACKAGES = ['issuer-portal', 'verifier-portal', 'portal-ui'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/build/',
    '**/.expo/',
    '**/coverage/',
    '**/.data/',
    '**/playwright-report/',
    '**/test-results/',
    'ai-service/', // Python: linted with Ruff (see ai-service/pyproject.toml)
    'docs/spikes/**', // Throwaway spike code, not held to lint rules
  ]),

  // Base rules for every JS/TS file.
  {
    files: [JS_TS],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Node.js code: backend API, crypto core, root tooling scripts and config files.
  {
    files: ['backend/**/*', 'crypto-core/**/*', 'scripts/**/*', '*.{js,mjs,cjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Browser code: React web portals (Vite) and portal-ui. React rules apply here only:
  // hooks rules (incl. the React Compiler checks of react-hooks 7), accessibility (jsx-a11y)
  // and Vite fast-refresh boundaries.
  {
    files: REACT_PACKAGES.map((dir) => `${dir}/**/*.{js,jsx,ts,tsx}`),
    extends: [reactHooks.configs.flat['recommended-latest'], jsxA11y.flatConfigs.recommended],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Fast-refresh boundaries matter in the Vite apps only (portal-ui is a tsc-built library).
  {
    files: ['issuer-portal/src/**/*.{jsx,tsx}', 'verifier-portal/src/**/*.{jsx,tsx}'],
    extends: [reactRefresh.configs.vite],
  },

  // Their tests, Playwright specs, scripts and config files run in Node.
  {
    files: REACT_PACKAGES.flatMap((dir) => [
      `${dir}/test/**/*`,
      `${dir}/e2e/**/*`,
      `${dir}/*.{js,mjs,ts}`,
    ]),
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // wallet/ (React Native / Expo): rules intentionally left for later.
  // When the Expo app is scaffolded, add a block here for 'wallet/**/*' with
  // React Native globals and eslint-plugin-react / react-hooks / react-native
  // (or eslint-config-expo's flat config).

  // Must stay last: turns off stylistic rules that conflict with Prettier.
  prettier,
]);
