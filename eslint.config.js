// @ts-check
// Root ESLint flat config (ESLint 9) shared by all JS/TS packages in the monorepo.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import expo from 'eslint-plugin-expo';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNative from 'eslint-plugin-react-native';
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
      `${dir}/scripts/**/*`,
      `${dir}/*.{js,mjs,ts}`,
    ]),
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // wallet/ (React Native / Expo). Scoped like the portals, with React Native rules instead of
  // the web-only jsx-a11y: eslint-plugin-react (JSX runtime), react-hooks 7 (React Compiler
  // checks), eslint-plugin-react-native (no text outside <Text>, no unused / inline styles, no
  // colour literals: colours come from the shared tokens) and eslint-plugin-expo
  // (EXPO_PUBLIC_* must be read in full, or Expo cannot inline it).
  {
    files: ['wallet/**/*.{js,jsx,ts,tsx}'],
    extends: [
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat['recommended-latest'],
    ],
    plugins: { 'react-native': reactNative, expo },
    settings: { react: { version: '19.3' } },
    languageOptions: {
      globals: { ...reactNative.environments['react-native'].globals, __DEV__: 'readonly' },
    },
    rules: {
      'react/prop-types': 'off', // TypeScript checks props
      'react-native/no-raw-text': 'error',
      'react-native/no-unused-styles': 'error',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-color-literals': 'error',
      'react-native/no-single-element-style-arrays': 'error',
      'expo/no-dynamic-env-var': 'error',
      'expo/no-env-var-destructuring': 'error',
    },
  },
  // Wallet config files, scripts and Jest tests run in Node (CommonJS config files included).
  {
    files: [
      'wallet/*.{js,ts}',
      'wallet/scripts/**/*',
      'wallet/test/**/*',
      'wallet/jest.config.js',
      'wallet/metro.config.js',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'react-native/no-raw-text': 'off',
      'react-native/no-inline-styles': 'off',
    },
  },

  // Must stay last: turns off stylistic rules that conflict with Prettier.
  prettier,
]);
