// @ts-check
// Root ESLint flat config (ESLint 9) shared by all JS/TS packages in the monorepo.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const JS_TS = '**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/build/',
    '**/.expo/',
    '**/coverage/',
    '**/.data/',
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

  // Browser code: React web portals (Vite).
  {
    files: ['issuer-portal/**/*', 'verifier-portal/**/*'],
    languageOptions: { globals: { ...globals.browser } },
  },

  // wallet/ (React Native / Expo): rules intentionally left for later.
  // When the Expo app is scaffolded, add a block here for 'wallet/**/*' with
  // React Native globals and eslint-plugin-react / react-hooks / react-native
  // (or eslint-config-expo's flat config).

  // Must stay last: turns off stylistic rules that conflict with Prettier.
  prettier,
]);
