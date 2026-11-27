// @ts-check
/**
 * Jest (jest-expo preset + React Native Testing Library).
 *
 * The shared packages are symlinked from outside this folder (file: dependencies), and the
 * SD-JWT stack is ESM-only, so three additions to the preset:
 *   - modulePaths: files reached through the crypto-core symlink resolve their imports (and
 *     the Babel runtime helpers that the transform injects) from wallet/node_modules too, like
 *     nodeModulesPaths in metro.config.js;
 *   - transform: @sd-jwt/core and @owf/identity-common ship .mjs only; they get the same Babel
 *     transformer (babel-preset-expo) the preset uses for .js/.ts(x);
 *   - transformIgnorePatterns: jest-expo's list plus @noble, @sd-jwt, @owf, @univault and the
 *     Google font package, which would otherwise be loaded untransformed.
 */
const expoPreset = require('jest-expo/jest-preset');

const JS_PATTERN = String.raw`\.[jt]sx?$`;
const jsTransform = expoPreset.transform[JS_PATTERN];
if (!jsTransform) throw new Error('jest-expo preset no longer has a .js transform');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Windows + coverage: a cold first run (empty transform cache) can exceed Jest's 5 s default.
  testTimeout: 30000,
  // Fresh call history for every test (implementations stay): no call counts leak between tests.
  clearMocks: true,
  modulePaths: ['<rootDir>/node_modules'],
  // The design tokens are not an npm dependency (see metro.config.js): map them the same way.
  moduleNameMapper: {
    [String.raw`^@univault/portal-ui/tokens$`]: '<rootDir>/../portal-ui/src/tokens.ts',
  },
  testMatch: ['<rootDir>/test/**/*.test.{ts,tsx}'],
  transform: { ...expoPreset.transform, [String.raw`\.mjs$`]: jsTransform },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@noble/.*|@sd-jwt/.*|@owf/.*|@univault/.*)',
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'src/**/*.{ts,tsx}',
    '!src/fixtures/**',
    '!src/components/index.ts',
    '!**/*.d.ts',
  ],
  // Just below the figures on 27 Nov 2026 (98.61 / 93.71 / 96.96 / 100), rounded down.
  // Raise them when coverage improves; never lower them to make a change pass.
  coverageThreshold: {
    global: { statements: 98, branches: 93, functions: 96, lines: 99 },
  },
  coverageReporters: ['text', 'html', 'json-summary'],
  coverageDirectory: 'coverage',
};
