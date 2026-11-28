/**
 * UI preferences and onboarding progress on the phone (AsyncStorage, Decision 023).
 *
 * STORAGE RULE: AsyncStorage is unencrypted, readable by anyone with a device backup or a
 * rooted phone. It holds NON-SECRET preferences only: the language, the appearance (theme) and
 * the onboarding progress flags. Never a key, credential, SD-JWT, claim, token, PIN or anything
 * personal: those go in secure storage. The lock DELAY is a preference; the locked / unlocked state
 * itself is never stored anywhere (src/security/app-lock.tsx). Those go in secure storage (expo-secure-store: Keychain / Android Keystore): the PIN
 * verifier already does (src/security/pin.ts). Every key is listed in PREFERENCE_KEYS; test/preferences.test.tsx
 * checks nothing else is ever written, and that each key only ever gets its allowed values.
 *
 * The onboarding flags only decide which screen opens first (src/onboarding/gate.ts). They
 * protect nothing. Whether security is set up is NOT a preference: it is "a PIN verifier exists
 * in the secure store" (src/onboarding/security-setup.ts, Decision 025).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isLanguage, type Language } from '../i18n/languages';

/** The ONLY keys the wallet writes to AsyncStorage (language: same name as the portals' key). */
export const PREFERENCE_KEYS = {
  language: 'univault.language',
  appearance: 'univault.appearance',
  onboardingCompleted: 'univault.onboardingCompleted',
  privacyAcknowledgedAt: 'univault.privacyAcknowledgedAt',
  /** "Lock after leaving the app" (src/security/app-lock.tsx). */
  lockDelay: 'univault.lockDelay',
} as const;

/**
 * The onboarding keys "Reset onboarding" (Diagnostics) removes; language and appearance stay.
 * (The PIN verifier is in the secure store: src/security/pin.ts deletePinData.)
 */
export const SETUP_PROGRESS_KEYS = [
  PREFERENCE_KEYS.onboardingCompleted,
  PREFERENCE_KEYS.privacyAcknowledgedAt,
] as const;

/** Stored value of a true flag (a missing key is false). */
export const FLAG_TRUE = 'true';

// ---------------------------------------------------------------------------------------------
// Language

/** The saved language, or null when none is saved, the value is unknown or storage fails. */
export async function loadLanguagePreference(): Promise<Language | null> {
  try {
    const value = await AsyncStorage.getItem(PREFERENCE_KEYS.language);
    return isLanguage(value) ? value : null;
  } catch {
    return null; // storage unavailable: start in the device language
  }
}

/** Saves the language; returns false if storage failed (the choice still applies this session). */
export async function saveLanguagePreference(language: Language): Promise<boolean> {
  try {
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, language);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Appearance (theme)

/** Settings → Appearance: follow the phone (default), or always light / always dark. */
export const APPEARANCE_PREFERENCES = ['system', 'light', 'dark'] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];
export const DEFAULT_APPEARANCE: AppearancePreference = 'system';

export const isAppearancePreference = (value: unknown): value is AppearancePreference =>
  typeof value === 'string' && (APPEARANCE_PREFERENCES as readonly string[]).includes(value);

/** The saved appearance; "system" when none is saved, the value is unknown or storage fails. */
export async function loadAppearancePreference(): Promise<AppearancePreference> {
  try {
    const value = await AsyncStorage.getItem(PREFERENCE_KEYS.appearance);
    return isAppearancePreference(value) ? value : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Saves the appearance; false if storage failed (the choice still applies this session). */
export async function saveAppearancePreference(value: AppearancePreference): Promise<boolean> {
  try {
    await AsyncStorage.setItem(PREFERENCE_KEYS.appearance, value);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Lock delay

/** Settings → Security → "Lock after leaving the app": Immediately (default) … 5 minutes. */
export const LOCK_DELAYS = ['immediately', '30s', '1m', '5m'] as const;
export type LockDelay = (typeof LOCK_DELAYS)[number];
export const DEFAULT_LOCK_DELAY: LockDelay = 'immediately';
export const LOCK_DELAY_MS: Record<LockDelay, number> = {
  immediately: 0,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 300_000,
};

export const isLockDelay = (value: unknown): value is LockDelay =>
  typeof value === 'string' && (LOCK_DELAYS as readonly string[]).includes(value);

/** The saved delay; "immediately" when none is saved, the value is unknown or storage fails. */
export async function loadLockDelayPreference(): Promise<LockDelay> {
  try {
    const value = await AsyncStorage.getItem(PREFERENCE_KEYS.lockDelay);
    return isLockDelay(value) ? value : DEFAULT_LOCK_DELAY;
  } catch {
    return DEFAULT_LOCK_DELAY;
  }
}

/** Saves the delay; false if storage failed (the choice still applies this session). */
export async function saveLockDelayPreference(value: LockDelay): Promise<boolean> {
  try {
    await AsyncStorage.setItem(PREFERENCE_KEYS.lockDelay, value);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Onboarding progress

/** When the holder ticked "I understand" on the Privacy screen, and which text they saw. */
export interface PrivacyAcknowledgement {
  /** ISO 8601 instant (UTC), e.g. 2026-11-28T09:30:00.000Z. */
  at: string;
  /** The privacy text's version, e.g. "privacy-v1" (PRIVACY_POLICY_VERSION). */
  version: string;
}

export interface OnboardingProgress {
  onboardingCompleted: boolean;
  privacyAcknowledgement: PrivacyAcknowledgement | null;
}

const VERSION_PATTERN = /^privacy-v\d+$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** Parses the stored acknowledgement JSON; null for anything malformed. */
export function parsePrivacyAcknowledgement(raw: string | null): PrivacyAcknowledgement | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null) return null;
    const { at, version } = value as Record<string, unknown>;
    if (typeof at !== 'string' || !ISO_INSTANT.test(at) || Number.isNaN(Date.parse(at)))
      return null;
    if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) return null;
    return { at, version };
  } catch {
    return null;
  }
}

/** Onboarding flags; a failing read counts as "not done" (the holder sees onboarding again). */
export async function loadOnboardingProgress(): Promise<OnboardingProgress> {
  try {
    const [completed, acknowledged] = await Promise.all([
      AsyncStorage.getItem(PREFERENCE_KEYS.onboardingCompleted),
      AsyncStorage.getItem(PREFERENCE_KEYS.privacyAcknowledgedAt),
    ]);
    return {
      onboardingCompleted: completed === FLAG_TRUE,
      privacyAcknowledgement: parsePrivacyAcknowledgement(acknowledged),
    };
  } catch {
    return { onboardingCompleted: false, privacyAcknowledgement: null };
  }
}

/** Saves "onboarding done" together with the privacy acknowledgement (one write). */
export async function saveOnboardingCompleted(
  acknowledgement: PrivacyAcknowledgement,
): Promise<boolean> {
  try {
    await AsyncStorage.multiSet([
      [PREFERENCE_KEYS.privacyAcknowledgedAt, JSON.stringify(acknowledgement)],
      [PREFERENCE_KEYS.onboardingCompleted, FLAG_TRUE],
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Removes the onboarding and privacy flags (keeps language and appearance). */
export async function clearSetupProgress(): Promise<boolean> {
  try {
    await AsyncStorage.multiRemove([...SETUP_PROGRESS_KEYS]);
    return true;
  } catch {
    return false;
  }
}
