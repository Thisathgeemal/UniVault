/**
 * The wallet PIN (Decision 025, docs/security/wallet-pin.md).
 *
 * The PIN itself is NEVER stored. A VERIFIER is: a random 16-byte salt, the KDF and its
 * parameters, and scrypt(PIN, salt), as JSON
 *     { "v": 1, "alg": "scrypt", "params": { "N", "r", "p", "dkLen" }, "salt": hex, "hash": hex }
 * in expo-secure-store (iOS Keychain / Android Keystore) under PIN_VERIFIER_KEY with
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY: readable only while the phone is unlocked, never synced or
 * restored to another device, and never in AsyncStorage. The parameters travel with the verifier,
 * so the default can be tuned later without breaking existing PINs.
 *
 * Rules for the PIN string: callers clear it from component state right after hashing or
 * verifying; it is never logged, never put in a route param, an error message or any storage.
 * Every function here fails with a fixed message (PinStoreError codes) or `false`, never with
 * the PIN in it. test/pin-secrecy.test.tsx searches logs, routes, storage and errors for it.
 *
 * Failed-attempt tracking for the app-lock task (no UI yet): a separate secure-store record
 * { failedAttempts, lockedUntil } (PIN_ATTEMPTS_KEY) with read / write / clear helpers.
 */
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { constantTimeEqual } from './constant-time';
import { isAcceptablePin, isPinFormat } from './pin-rules';

export const PIN_VERIFIER_KEY = 'univault.pinVerifier';
export const PIN_ATTEMPTS_KEY = 'univault.pinAttempts';

/** Options for every secure-store call: this device only, while unlocked, no OS prompt. */
export const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

export interface ScryptParams {
  /** CPU/memory cost (a power of two); memory = 128 × r × N bytes. */
  N: number;
  r: number;
  p: number;
  dkLen: number;
}

/**
 * Default KDF: scrypt N = 2^12, r = 8, p = 1 (4 MiB per guess), 32-byte output.
 * Measured 15 ms on the developer's PC (Node 26, V8 JIT); Hermes interprets without a JIT and a
 * mid-range Android core is slower, an estimated 10–40× in total, so about 150–600 ms on the
 * phone, centred on the 250–500 ms target. Check it with Diagnostics → PIN hashing time and
 * tune (wallet-pin.md §5): N = 2^13 if it is under 250 ms, keep 2^12 as the floor.
 */
export const DEFAULT_KDF_PARAMS: ScryptParams = { N: 2 ** 12, r: 8, p: 1, dkLen: 32 };

export const SALT_BYTES = 16;

export interface PinVerifier {
  v: 1;
  alg: 'scrypt';
  params: ScryptParams;
  /** 16 random bytes, hex. */
  salt: string;
  /** scrypt(PIN, salt, params), hex. */
  hash: string;
}

export interface PinAttemptRecord {
  failedAttempts: number;
  /** ISO 8601 instant until which PIN entry is locked, or null. */
  lockedUntil: string | null;
}

export const NO_ATTEMPTS: PinAttemptRecord = { failedAttempts: 0, lockedUntil: null };

/** Errors from the PIN store. The message is fixed per code: never the PIN, never a cause. */
export class PinStoreError extends Error {
  constructor(readonly code: 'PIN_REJECTED' | 'STORE_FAILED') {
    super(
      code === 'PIN_REJECTED' ? 'The PIN does not meet the rules' : 'The PIN could not be saved',
    );
    this.name = 'PinStoreError';
  }
}

const isPowerOfTwo = (n: number) => Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;

/** Parameters a verifier may carry (bounds keep a tampered record from hanging the app). */
export function isValidParams(value: unknown): value is ScryptParams {
  if (typeof value !== 'object' || value === null) return false;
  const { N, r, p, dkLen } = value as Record<string, unknown>;
  return (
    typeof N === 'number' &&
    isPowerOfTwo(N) &&
    N >= 2 ** 10 &&
    N <= 2 ** 17 &&
    typeof r === 'number' &&
    Number.isInteger(r) &&
    r >= 1 &&
    r <= 16 &&
    typeof p === 'number' &&
    Number.isInteger(p) &&
    p >= 1 &&
    p <= 4 &&
    dkLen === 32
  );
}

/** Parses a stored verifier; null for anything malformed. */
export function parsePinVerifier(raw: string | null): PinVerifier | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof value !== 'object' || value === null) return null;
    const { v, alg, params, salt, hash } = value;
    if (v !== 1 || alg !== 'scrypt' || !isValidParams(params)) return null;
    if (typeof salt !== 'string' || !/^[0-9a-f]{32}$/.test(salt)) return null;
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return null;
    return { v, alg, params, salt, hash };
  } catch {
    return null;
  }
}

async function derive(pin: string, salt: Uint8Array, params: ScryptParams): Promise<Uint8Array> {
  const input = new TextEncoder().encode(pin);
  try {
    // async with short ticks: the UI thread keeps drawing (spinner) while scrypt runs
    return await scryptAsync(input, salt, { ...params, asyncTick: 10 });
  } finally {
    input.fill(0); // the byte copy is wiped; the JS string itself cannot be
  }
}

/** A new verifier with a fresh random salt (no storage). */
export async function createPinVerifier(
  pin: string,
  params: ScryptParams = DEFAULT_KDF_PARAMS,
): Promise<PinVerifier> {
  const salt = getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(pin, salt, params);
  return { v: 1, alg: 'scrypt', params, salt: bytesToHex(salt), hash: bytesToHex(hash) };
}

/** Stores a verifier for a new PIN (and resets the attempt record). Throws PinStoreError. */
export async function savePin(
  pin: string,
  params: ScryptParams = DEFAULT_KDF_PARAMS,
): Promise<void> {
  if (!isAcceptablePin(pin)) throw new PinStoreError('PIN_REJECTED');
  try {
    const verifier = await createPinVerifier(pin, params);
    await SecureStore.setItemAsync(
      PIN_VERIFIER_KEY,
      JSON.stringify(verifier),
      SECURE_STORE_OPTIONS,
    );
    await clearPinAttempts();
  } catch {
    throw new PinStoreError('STORE_FAILED');
  }
}

async function readVerifier(): Promise<PinVerifier | null> {
  try {
    return parsePinVerifier(await SecureStore.getItemAsync(PIN_VERIFIER_KEY, SECURE_STORE_OPTIONS));
  } catch {
    return null;
  }
}

/** True only for the right PIN; false for a wrong one, no verifier or any failure. Never throws. */
export async function verifyPin(pin: string): Promise<boolean> {
  try {
    if (!isPinFormat(pin)) return false;
    const verifier = await readVerifier();
    if (!verifier) return false;
    const derived = await derive(pin, hexToBytes(verifier.salt), verifier.params);
    return constantTimeEqual(derived, hexToBytes(verifier.hash));
  } catch {
    return false;
  }
}

/** A well-formed verifier is stored (the gate's security check). */
export async function hasPinVerifier(): Promise<boolean> {
  return (await readVerifier()) !== null;
}

/** Removes the verifier and the attempt record (Diagnostics → Reset onboarding, dev only). */
export async function deletePinData(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(PIN_VERIFIER_KEY, SECURE_STORE_OPTIONS);
    await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY, SECURE_STORE_OPTIONS);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Failed attempts (for the app-lock task)

export function parseAttemptRecord(raw: string | null): PinAttemptRecord {
  if (raw === null) return NO_ATTEMPTS;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    const failed = value?.failedAttempts;
    const until = value?.lockedUntil;
    if (typeof failed !== 'number' || !Number.isInteger(failed) || failed < 0) return NO_ATTEMPTS;
    if (until !== null && (typeof until !== 'string' || Number.isNaN(Date.parse(until))))
      return NO_ATTEMPTS;
    return { failedAttempts: failed, lockedUntil: until };
  } catch {
    return NO_ATTEMPTS;
  }
}

/** The attempt record; "no attempts" when none is stored or it cannot be read. */
export async function readPinAttempts(): Promise<PinAttemptRecord> {
  try {
    return parseAttemptRecord(
      await SecureStore.getItemAsync(PIN_ATTEMPTS_KEY, SECURE_STORE_OPTIONS),
    );
  } catch {
    return NO_ATTEMPTS;
  }
}

export async function writePinAttempts(record: PinAttemptRecord): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, JSON.stringify(record), SECURE_STORE_OPTIONS);
    return true;
  } catch {
    return false;
  }
}

export async function clearPinAttempts(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY, SECURE_STORE_OPTIONS);
}

// ---------------------------------------------------------------------------------------------
// Diagnostics

/** Times one derivation with the default parameters on a random, throwaway input (never a PIN). */
export async function measurePinHashing(
  params: ScryptParams = DEFAULT_KDF_PARAMS,
  now: () => number = () => performance.now(),
): Promise<{ ms: number; params: ScryptParams }> {
  const salt = getRandomValues(new Uint8Array(SALT_BYTES));
  const sample = bytesToHex(getRandomValues(new Uint8Array(3))); // 6 hex characters, not a PIN
  const start = now();
  await derive(sample, salt, params);
  return { ms: Math.round(now() - start), params };
}
