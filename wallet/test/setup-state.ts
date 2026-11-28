/**
 * Saved setup states for tests. test/setup.ts seeds COMPLETED (onboarded + placeholder security
 * flag) before every test, because most tests are about the wallet itself, which the gate opens
 * only for a holder who finished setup. Tests of the gate and onboarding start from
 * freshInstall() or seedOnboardedWithoutSecurity() instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FLAG_TRUE, PREFERENCE_KEYS } from '../src/lib/preferences';
import { PRIVACY_POLICY_VERSION, type SetupState } from '../src/onboarding/gate';

export const ACKNOWLEDGED = { at: '2026-11-28T08:00:00.000Z', version: PRIVACY_POLICY_VERSION };

export const COMPLETED_SETUP: SetupState = {
  onboardingCompleted: true,
  privacyAcknowledgement: ACKNOWLEDGED,
  securitySetupComplete: true,
};

const onboardedEntries = (): [string, string][] => [
  [PREFERENCE_KEYS.onboardingCompleted, FLAG_TRUE],
  [PREFERENCE_KEYS.privacyAcknowledgedAt, JSON.stringify(ACKNOWLEDGED)],
];

/** Mock call lists start empty in every test (seeding must not count as the test's writes). */
function forgetSeedCalls() {
  (AsyncStorage.multiSet as jest.Mock).mockClear();
  (AsyncStorage.setItem as jest.Mock).mockClear();
  (AsyncStorage.clear as jest.Mock).mockClear();
}

/** Onboarding done and the placeholder security flag set: the gate opens the tabs. */
export async function seedCompletedSetup() {
  await AsyncStorage.multiSet([
    ...onboardedEntries(),
    [PREFERENCE_KEYS.securitySetupCompleted, FLAG_TRUE],
  ]);
  forgetSeedCalls();
}

/** Onboarding done, security not set up: the gate opens /setup/security. */
export async function seedOnboardedWithoutSecurity() {
  await AsyncStorage.clear();
  await AsyncStorage.multiSet(onboardedEntries());
  forgetSeedCalls();
}

/** Nothing saved (first start): the gate opens onboarding. */
export async function freshInstall() {
  await AsyncStorage.clear();
  forgetSeedCalls();
}
