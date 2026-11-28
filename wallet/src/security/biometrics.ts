/**
 * Biometric unlock (Decision 026, docs/security/wallet-authentication.md).
 *
 * PROOF = the OS releasing a secret, never a boolean. On enable a random 32-byte UNLOCK SECRET is
 * stored in expo-secure-store with `requireAuthentication: true` (this device only, while
 * unlocked). The OS keeps it behind its biometric check: Android BiometricPrompt with
 * BIOMETRIC_STRONG and a key-bound CryptoObject; iOS a Keychain item with `.biometryCurrentSet`.
 * Neither offers the device passcode as a way in. A biometric unlock is a SUCCESSFUL READ of that
 * item; `LocalAuthentication.authenticateAsync()` is never used as proof (a boolean can be
 * faked by any code running in the app; a key the OS will not release cannot).
 *
 * When the phone's biometrics change (a new fingerprint, all removed), the OS invalidates the
 * item and the read returns null: the secret is deleted, `biometricEnabled` set to false, and the
 * holder must use the PIN ("invalidated").
 *
 * Only "available-strong" may be enabled. iOS Expo Go cannot store such items (no
 * NSFaceIDUsageDescription in Expo Go): reported "unsupported-in-expo-go", the PIN is used.
 * The secret is never logged, returned, put in state, AsyncStorage or an error.
 */
import { bytesToHex } from '@noble/hashes/utils.js';
import { getRandomValues } from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isExpoGo } from '../config/app-info';
import { withAuthActivity } from './auth-activity';
import { SECURE_STORE_OPTIONS } from './pin';

export const UNLOCK_SECRET_KEY = 'univault.biometricUnlockSecret';
/** Non-authenticated flag: "biometric unlock is on" (the secret itself needs the biometric). */
export const BIOMETRIC_ENABLED_KEY = 'univault.biometricEnabled';
export const UNLOCK_SECRET_BYTES = 32;

export type BiometricCapabilityKind =
  | 'available-strong'
  | 'available-weak-only'
  | 'not-enrolled'
  | 'no-hardware'
  | 'unsupported-in-expo-go';

/** What the phone offers, in words for the UI (locales: biometrics.kind.*). */
export type BiometricKind = 'fingerprint' | 'face' | 'fingerprintOrFace';

export interface BiometricCapability {
  kind: BiometricCapabilityKind;
  biometric: BiometricKind;
  /**
   * A strong (Class 3) fingerprint is enrolled: fingerprint hardware and the strongest enrolled
   * level is BIOMETRIC_STRONG. expo-local-authentication only reports the strongest level, not
   * one per modality, so this is the closest the app can get.
   */
  fingerprintEnrolled: boolean;
}

export type NotAvailableKind = Exclude<BiometricCapabilityKind, 'available-strong'>;

/**
 * The line that says why biometric unlock is not offered. Weak-only with face unlock: "This
 * phone's face unlock uses the camera and isn't secure enough for UniVault. You can use your
 * fingerprint or your PIN." ("your PIN" only without a strong fingerprint enrolled).
 */
export function unavailableMessageKey(
  kind: NotAvailableKind,
  biometric: BiometricKind,
  fingerprintEnrolled: boolean,
):
  | 'biometrics.weakFace.fingerprint'
  | 'biometrics.weakFace.pin'
  | `biometrics.unavailable.${NotAvailableKind}` {
  if (kind === 'available-weak-only' && biometric !== 'fingerprint') {
    return fingerprintEnrolled ? 'biometrics.weakFace.fingerprint' : 'biometrics.weakFace.pin';
  }
  return `biometrics.unavailable.${kind}`;
}

/** Names the biometric for the UI from the supported types (iris counts as face). */
export function biometricKindOf(
  types: readonly LocalAuthentication.AuthenticationType[],
): BiometricKind {
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const face =
    types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ||
    types.includes(LocalAuthentication.AuthenticationType.IRIS);
  if (finger && face) return 'fingerprintOrFace';
  return face ? 'face' : 'fingerprint';
}

/**
 * One typed answer: available-strong (may be enabled), available-weak-only (e.g. 2D face
 * unlock: refused), not-enrolled, no-hardware, unsupported-in-expo-go (iOS Expo Go). A failing
 * native call counts as no-hardware (the PIN is always there).
 */
export async function detectBiometrics(): Promise<BiometricCapability> {
  try {
    const [hardware, enrolled, types, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    const biometric = biometricKindOf(types);
    const fingerprintEnrolled =
      hardware &&
      enrolled &&
      types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) &&
      level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
    const result = (kind: BiometricCapabilityKind): BiometricCapability => ({
      kind,
      biometric,
      fingerprintEnrolled,
    });
    if (!hardware) return result('no-hardware');
    if (Platform.OS === 'ios' && isExpoGo()) return result('unsupported-in-expo-go');
    if (!enrolled || level < LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK) {
      return result('not-enrolled');
    }
    // strong = a strong biometric is enrolled AND the secure store can bind a key to it
    const strong =
      level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG &&
      SecureStore.canUseBiometricAuthentication();
    return result(strong ? 'available-strong' : 'available-weak-only');
  } catch {
    return { kind: 'no-hardware', biometric: 'fingerprint', fingerprintEnrolled: false };
  }
}

/** Options for the authenticated item: biometric required, this device only, the OS prompt. */
export function unlockSecretOptions(prompt: string): SecureStore.SecureStoreOptions {
  return {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: true,
    authenticationPrompt: prompt,
  };
}

export type BiometricFailure =
  'cancelled' | 'locked-out' | 'invalidated' | 'unavailable' | 'failed';
export type BiometricResult = { ok: true } | { ok: false; reason: BiometricFailure };

/** Maps a secure-store error (Android BiometricPrompt / iOS Keychain texts) to a reason. */
export function classifyBiometricError(error: unknown): BiometricFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel/i.test(message)) return 'cancelled';
  if (/lockout/i.test(message)) return 'locked-out';
  if (/NSFaceIDUsageDescription|unsupported|not supported|No hardware|not available/i.test(message))
    return 'unavailable';
  return 'failed';
}

/** The non-authenticated flag (false when unset or unreadable). */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY, SECURE_STORE_OPTIONS)) === 'true';
  } catch {
    return false;
  }
}

const isSecret = (value: string | null): boolean =>
  value !== null && new RegExp(`^[0-9a-f]{${UNLOCK_SECRET_BYTES * 2}}$`).test(value);

/** Turns biometric unlock off: deletes the secret and clears the flag. */
export async function disableBiometricUnlock(): Promise<void> {
  await SecureStore.deleteItemAsync(UNLOCK_SECRET_KEY, SECURE_STORE_OPTIONS).catch(() => undefined);
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false', SECURE_STORE_OPTIONS).catch(
    () => undefined,
  );
}

/**
 * Reads the secret: the OS shows its biometric prompt and releases the value only on success.
 * Ok only for a released, well-formed secret. A null read means the OS invalidated the item
 * (biometrics changed): biometric unlock is turned off and the PIN is required.
 */
export async function unlockWithBiometrics(prompt: string): Promise<BiometricResult> {
  let released: string | null;
  try {
    released = await SecureStore.getItemAsync(UNLOCK_SECRET_KEY, unlockSecretOptions(prompt));
  } catch (error) {
    return { ok: false, reason: classifyBiometricError(error) };
  }
  const ok = isSecret(released);
  released = null; // the value is not needed: being released was the proof
  if (ok) return { ok: true };
  await disableBiometricUnlock();
  return { ok: false, reason: 'invalidated' };
}

/**
 * Turns biometric unlock on (only for available-strong): stores a fresh secret behind the
 * biometric (Android shows the prompt while storing; iOS stores silently, so the secret is read
 * back once, which shows the prompt), then sets the flag. On any failure nothing stays behind.
 */
export function enableBiometricUnlock(prompt: string): Promise<BiometricResult> {
  return withAuthActivity(() => enableNow(prompt)); // the OS prompt is ours: no app lock on it
}

async function enableNow(prompt: string): Promise<BiometricResult> {
  const capability = await detectBiometrics();
  if (capability.kind !== 'available-strong') return { ok: false, reason: 'unavailable' };
  try {
    await SecureStore.setItemAsync(
      UNLOCK_SECRET_KEY,
      bytesToHex(getRandomValues(new Uint8Array(UNLOCK_SECRET_BYTES))),
      unlockSecretOptions(prompt),
    );
  } catch (error) {
    await disableBiometricUnlock();
    return { ok: false, reason: classifyBiometricError(error) };
  }
  if (Platform.OS === 'ios') {
    const check = await unlockWithBiometrics(prompt);
    if (!check.ok) {
      await disableBiometricUnlock();
      return check;
    }
  }
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true', SECURE_STORE_OPTIONS);
  return { ok: true };
}
