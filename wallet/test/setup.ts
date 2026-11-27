/**
 * Jest setup: English UI, the crypto runtime set up exactly as in the app (index.ts imports
 * src/lib/crypto-setup first), the real app config for expo-constants, and a console guard.
 *
 * CONSOLE GUARD: any console.error or console.warn during a test FAILS that test (after it
 * runs, listing the messages). Warnings such as expo-router's "Too many screens defined" or
 * React's "overlapping act() calls" point at real problems (a route map that does not match
 * app/, an un-awaited update), so they must be fixed, not ignored. A test that expects an error
 * (e.g. an ErrorBoundary test) mocks console.error itself, which replaces the guard for that
 * test only. Third-party noise that truly cannot be avoided goes in CONSOLE_ALLOW_LIST with the
 * reason; keep it empty when possible.
 */
import '../src/lib/crypto-setup';
import { setupI18n, i18n } from '../src/i18n';

// jest-expo's expo-constants mock has no app config: give it the real one (app.config.ts)
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  const Constants = actual.default ?? actual;
  const appConfig = jest.requireActual('../app.config').default({ config: {} });
  return {
    __esModule: true,
    default: { ...Constants, expoConfig: { ...appConfig, sdkVersion: '58.0.0' } },
  };
});

/** Known, documented third-party console output that cannot be avoided (none today). */
export const CONSOLE_ALLOW_LIST: readonly { pattern: RegExp; reason: string }[] = [];

const LEVELS = ['error', 'warn'] as const;
const original = { error: console.error, warn: console.warn };
let unexpected: string[] = [];

const describeArg = (arg: unknown): string =>
  arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg);

setupI18n('en');

beforeEach(async () => {
  unexpected = [];
  for (const level of LEVELS) {
    console[level] = (...args: unknown[]) => {
      const message = args.map(describeArg).join(' ');
      if (CONSOLE_ALLOW_LIST.some(({ pattern }) => pattern.test(message))) return;
      unexpected.push(`console.${level}: ${message.split('\n')[0]}`);
      original[level](...args); // still printed, with its stack, to help find the cause
    };
  }
  if (i18n.language !== 'en') await i18n.changeLanguage('en');
});

afterEach(() => {
  console.error = original.error;
  console.warn = original.warn;
  if (unexpected.length > 0) {
    const messages = unexpected;
    unexpected = [];
    throw new Error(
      `Unexpected console output during this test (fix the cause; see test/setup.ts):\n` +
        messages.map((m) => `  - ${m}`).join('\n'),
    );
  }
});
