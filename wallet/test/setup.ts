/**
 * Jest setup: English UI, AsyncStorage (official mock) and an in-memory secure store emptied and
 * then seeded with a holder who finished onboarding and set a PIN (test/setup-state.ts: the gate
 * opens the tabs; gate, onboarding and PIN tests start from freshInstall()), font and splash
 * mocks for the root layout, the crypto runtime set up exactly as in the app (index.ts imports
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setupI18n, i18n } from '../src/i18n';
import * as appInfo from '../src/config/app-info';
import { resetAuthActivity } from '../src/security/auth-activity';
import { resetDevScreenCaptureBlock } from '../src/security/screen-capture';
import { resetReduceMotionCache } from '../src/theme/reduce-motion';
import { seedCompletedSetup } from './setup-state';

// expo-screen-capture: a native module; mocked for every test (src/security/screen-capture.ts is
// loaded by this file, so a per-file mock would come too late). Tests read the jest.fns.
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));

// AsyncStorage's official in-memory Jest mock; emptied before every test (no state leaks)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The root layout (rendered by every test of the real app/ tree) loads the Sinhala font and
// holds the splash screen: loaded at once by default; app.test.tsx changes useFonts per test.
jest.mock('@expo-google-fonts/noto-sans/400Regular', () => ({ NotoSans_400Regular: 1 }));
jest.mock('@expo-google-fonts/noto-sans/500Medium', () => ({ NotoSans_500Medium: 2 }));
jest.mock('@expo-google-fonts/noto-sans/600SemiBold', () => ({ NotoSans_600SemiBold: 3 }));
jest.mock('@expo-google-fonts/noto-sans-sinhala/400Regular', () => ({
  NotoSansSinhala_400Regular: 4,
}));
jest.mock('@expo-google-fonts/noto-sans-sinhala/600SemiBold', () => ({
  NotoSansSinhala_600SemiBold: 5,
}));
// only useFonts is replaced: the icon font (@expo/vector-icons) still uses the real module
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: jest.fn(() => [true, null]),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

// expo-secure-store: an in-memory Keychain/Keystore (the real constants, e.g.
// WHEN_UNLOCKED_THIS_DEVICE_ONLY, come from jest-expo's native-module mock). Emptied before every
// test; tests read `mockStore` and the options each call received.
jest.mock('expo-secure-store', () => {
  const actual = jest.requireActual<Record<string, unknown>>('expo-secure-store');
  const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
  const store = new Map<string, string>();
  /** Keys stored with requireAuthentication: reading them is the OS biometric prompt. */
  const authItems = new Set<string>();
  /** What the next OS prompt does (tests set it; every prompt is counted). */
  const auth: { outcome: string; prompts: string[] } = { outcome: 'success', prompts: [] };
  const prompt = (text: string | undefined) => {
    auth.prompts.push(text ?? '');
    const errors: Record<string, string> = {
      cancel: 'Could not authenticate the user: User canceled the authentication',
      lockout: 'Could not authenticate the user: Lockout',
      error: 'Could not authenticate the user: Unknown error (code: 99)',
      unsupported: 'You must set `NSFaceIDUsageDescription` in your Info.plist file',
    };
    if (errors[auth.outcome]) throw new Error(errors[auth.outcome]);
  };
  type MockOptions = { requireAuthentication?: boolean; authenticationPrompt?: string };
  return {
    ...actual,
    setItemAsync: jest.fn(async (key: string, value: string, options?: MockOptions) => {
      // Android encrypts with the biometric-bound key: the prompt appears while storing
      if (options?.requireAuthentication && Platform.OS === 'android')
        prompt(options.authenticationPrompt);
      store.set(key, value);
      if (options?.requireAuthentication) authItems.add(key);
      else authItems.delete(key);
    }),
    getItemAsync: jest.fn(async (key: string, options?: MockOptions) => {
      if (authItems.has(key) && store.has(key)) {
        prompt(options?.authenticationPrompt);
        if (auth.outcome === 'invalidated') return null; // the OS dropped the key: null, as on device
      }
      return store.get(key) ?? null;
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
      authItems.delete(key);
    }),
    canUseBiometricAuthentication: jest.fn(() => true),
    mockStore: store,
    mockAuth: auth,
    mockReset: () => {
      store.clear();
      authItems.clear();
      auth.outcome = 'success';
      auth.prompts.length = 0;
    },
  };
});

// expo-local-authentication: no biometric hardware by default (the PIN-only path every other
// test expects); biometric tests set the answers (test/biometrics.test.ts)
jest.mock('expo-local-authentication', () => {
  const actual = jest.requireActual<Record<string, unknown>>('expo-local-authentication');
  return {
    ...actual,
    hasHardwareAsync: jest.fn(async () => false),
    isEnrolledAsync: jest.fn(async () => false),
    supportedAuthenticationTypesAsync: jest.fn(async () => []),
    getEnrolledLevelAsync: jest.fn(async () => 0),
    authenticateAsync: jest.fn(async () => ({ success: true })),
  };
});

// expo-crypto's native getRandomValues is a no-op in Jest: fill from Node's CSPRNG instead, so a
// salt is really random per call (the PIN tests check that)
jest.mock('expo-crypto', () => ({
  ...jest.requireActual<Record<string, unknown>>('expo-crypto'),
  getRandomValues: jest.fn(
    <T extends ArrayBufferView>(array: T): T =>
      jest
        .requireActual<typeof import('node:crypto')>('node:crypto')
        .webcrypto.getRandomValues(array as unknown as Uint8Array) as unknown as T,
  ),
}));

// jest-expo's expo-constants mock has no app config: give it the real one (app.config.ts)
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  const Constants = actual.default ?? actual;
  const appConfig = jest.requireActual('../app.config').default({ config: {} });
  return {
    __esModule: true,
    ...actual, // ExecutionEnvironment and the other named exports
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
  resetReduceMotionCache();
  resetAuthActivity();
  resetDevScreenCaptureBlock();
  // tests of other features start unlocked; test/app-lock.test.tsx turns the lock back on
  jest.spyOn(appInfo, 'lockOnAppStart').mockReturnValue(false);
  await AsyncStorage.clear();
  await seedCompletedSetup();
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
