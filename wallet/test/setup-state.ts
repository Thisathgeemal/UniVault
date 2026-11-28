/**
 * Saved setup states for tests. test/setup.ts seeds COMPLETED (onboarded + a PIN verifier in the
 * secure store) before every test, because most tests are about the wallet itself, which the
 * gate opens only for a holder who finished setup. Tests of the gate, onboarding and the PIN start
 * from freshInstall() or seedOnboardedWithoutSecurity() instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { FLAG_TRUE, PREFERENCE_KEYS } from '../src/lib/preferences';
import { PRIVACY_POLICY_VERSION, type SetupState } from '../src/onboarding/gate';
import { createPinVerifier, PIN_VERIFIER_KEY } from '../src/security/pin';

export const ACKNOWLEDGED = { at: '2026-11-28T08:00:00.000Z', version: PRIVACY_POLICY_VERSION };

/** The PIN behind the seeded verifier (passes the rules; searched for by pin-secrecy tests). */
export const TEST_PIN = '274913';

export const COMPLETED_SETUP: SetupState = {
  onboardingCompleted: true,
  privacyAcknowledgement: ACKNOWLEDGED,
  securitySetupComplete: true,
};

/** The in-memory secure store of the expo-secure-store mock (test/setup.ts). */
const mock = SecureStore as unknown as {
  mockStore: Map<string, string>;
  mockAuth: { outcome: string; prompts: string[] };
  mockReset: () => void;
};
export const secureStore = mock.mockStore;

/** The mocked OS biometric prompt: what the next one does, and every prompt shown. */
export type PromptOutcome =
  'success' | 'cancel' | 'lockout' | 'error' | 'invalidated' | 'unsupported';
export const osPrompt = {
  set: (outcome: PromptOutcome) => {
    mock.mockAuth.outcome = outcome;
  },
  get shown(): readonly string[] {
    return mock.mockAuth.prompts;
  },
};

/** One real verifier for TEST_PIN per test file (scrypt with the default parameters, once). */
let seededVerifier: Promise<string> | null = null;
const verifierJson = () =>
  (seededVerifier ??= createPinVerifier(TEST_PIN).then((v) => JSON.stringify(v)));

const onboardedEntries = (): [string, string][] => [
  [PREFERENCE_KEYS.onboardingCompleted, FLAG_TRUE],
  [PREFERENCE_KEYS.privacyAcknowledgedAt, JSON.stringify(ACKNOWLEDGED)],
];

/** Mock call lists start empty in every test (seeding must not count as the test's writes). */
function forgetSeedCalls() {
  for (const fn of [
    AsyncStorage.multiSet,
    AsyncStorage.setItem,
    AsyncStorage.clear,
    SecureStore.setItemAsync,
    SecureStore.getItemAsync,
    SecureStore.deleteItemAsync,
  ]) {
    (fn as jest.Mock).mockClear();
  }
}

/** Onboarding done and a PIN set: the gate opens the tabs. */
export async function seedCompletedSetup() {
  mock.mockReset();
  await AsyncStorage.multiSet(onboardedEntries());
  secureStore.set(PIN_VERIFIER_KEY, await verifierJson());
  forgetSeedCalls();
}

/** Onboarding done, no PIN: the gate opens /setup/security. */
export async function seedOnboardedWithoutSecurity() {
  await AsyncStorage.clear();
  mock.mockReset();
  await AsyncStorage.multiSet(onboardedEntries());
  forgetSeedCalls();
}

/** Nothing saved (first start): the gate opens onboarding. */
export async function freshInstall() {
  await AsyncStorage.clear();
  mock.mockReset();
  forgetSeedCalls();
}
