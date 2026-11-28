/**
 * The PIN store (src/security/pin.ts, Decision 025): verifier format ({ v, alg, params, salt, hash },
 * a fresh random salt per setup), verifyPin (right PIN true, wrong PINs false, the constant-time
 * compare used), the secure-store options (WHEN_UNLOCKED_THIS_DEVICE_ONLY, no OS prompt), nothing
 * in AsyncStorage, malformed records, the attempt record for the app-lock task, failures that
 * never throw with the PIN, and the Diagnostics measurement.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as constantTime from '../src/security/constant-time';
import {
  clearPinAttempts,
  createPinVerifier,
  DEFAULT_KDF_PARAMS,
  deletePinData,
  hasPinVerifier,
  isValidParams,
  measurePinHashing,
  NO_ATTEMPTS,
  parseAttemptRecord,
  parsePinVerifier,
  PIN_ATTEMPTS_KEY,
  PIN_VERIFIER_KEY,
  PinStoreError,
  readPinAttempts,
  savePin,
  SECURE_STORE_OPTIONS,
  verifyPin,
  writePinAttempts,
} from '../src/security/pin';
import { isSecuritySetupComplete } from '../src/onboarding/security-setup';
import { freshInstall, secureStore } from './setup-state';

const PIN = '582047';
const setItemAsync = SecureStore.setItemAsync as jest.Mock;
const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

const stored = () =>
  JSON.parse(secureStore.get(PIN_VERIFIER_KEY) ?? 'null') as Record<string, unknown>;

beforeEach(async () => {
  await freshInstall();
});
afterEach(() => jest.restoreAllMocks());

describe('verifier', () => {
  it('stores { v, alg, params, salt, hash } as JSON under one secure-store key', async () => {
    await savePin(PIN);
    const v = stored();
    expect(Object.keys(v).sort()).toEqual(['alg', 'hash', 'params', 'salt', 'v']);
    expect(v).toMatchObject({ v: 1, alg: 'scrypt', params: DEFAULT_KDF_PARAMS });
    expect(v.salt).toMatch(/^[0-9a-f]{32}$/); // 16 bytes
    expect(v.hash).toMatch(/^[0-9a-f]{64}$/); // 32 bytes
    expect(JSON.stringify(v)).not.toContain(PIN);
    expect(DEFAULT_KDF_PARAMS).toEqual({ N: 4096, r: 8, p: 1, dkLen: 32 });
  });

  it('uses a fresh random salt for every setup (same PIN, different verifier)', async () => {
    const a = await createPinVerifier(PIN);
    const b = await createPinVerifier(PIN);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('is written with WHEN_UNLOCKED_THIS_DEVICE_ONLY and no OS authentication prompt', async () => {
    await savePin(PIN);
    expect(SECURE_STORE_OPTIONS).toEqual({
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: false,
    });
    expect(SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY).toBeDefined();
    for (const call of [...setItemAsync.mock.calls, ...getItemAsync.mock.calls]) {
      expect(call.at(-1)).toEqual(SECURE_STORE_OPTIONS);
    }
    expect(setItemAsync).toHaveBeenCalledWith(
      PIN_VERIFIER_KEY,
      expect.any(String),
      SECURE_STORE_OPTIONS,
    );
  });

  it('never touches AsyncStorage', async () => {
    await savePin(PIN);
    await verifyPin(PIN);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('refuses a weak PIN before hashing anything', async () => {
    await expect(savePin('123456')).rejects.toEqual(new PinStoreError('PIN_REJECTED'));
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it('a failing secure store is reported without the PIN', async () => {
    setItemAsync.mockRejectedValueOnce(new Error(`keystore broke near ${PIN}`));
    const error = await savePin(PIN).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PinStoreError);
    expect((error as PinStoreError).code).toBe('STORE_FAILED');
    expect(String(error)).not.toContain(PIN);
    expect((error as Error).message).toBe('The PIN could not be saved');
    expect((error as { cause?: unknown }).cause).toBeUndefined();
  });
});

describe('verifyPin', () => {
  it('true for the right PIN, false for wrong ones', async () => {
    await savePin(PIN);
    expect(await verifyPin(PIN)).toBe(true);
    for (const wrong of ['582048', '582074', '000000', '274913']) {
      expect([wrong, await verifyPin(wrong)]).toEqual([wrong, false]);
    }
  });

  it('compares the derived hash with the constant-time compare', async () => {
    const compare = jest.spyOn(constantTime, 'constantTimeEqual');
    await savePin(PIN);
    await verifyPin('582049');
    expect(compare).toHaveBeenCalledTimes(1);
    const [a, b] = compare.mock.calls[0]!;
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
  });

  it('re-derives with the parameters stored in the verifier, not the current default', async () => {
    await savePin(PIN, { N: 2 ** 10, r: 8, p: 1, dkLen: 32 });
    expect(stored().params).toEqual({ N: 1024, r: 8, p: 1, dkLen: 32 });
    expect(await verifyPin(PIN)).toBe(true);
  });

  it('false (never a throw) without a verifier, for malformed input or a failing store', async () => {
    expect(await verifyPin(PIN)).toBe(false);
    await savePin(PIN);
    expect(await verifyPin('58204')).toBe(false);
    expect(await verifyPin('58204a')).toBe(false);
    getItemAsync.mockRejectedValueOnce(new Error('keystore locked'));
    expect(await verifyPin(PIN)).toBe(false);
    secureStore.set(PIN_VERIFIER_KEY, '{ not json');
    expect(await verifyPin(PIN)).toBe(false);
  });

  it('a failure while deriving is false, not a throw', async () => {
    await savePin(PIN);
    jest.spyOn(globalThis, 'TextEncoder').mockImplementationOnce(() => {
      throw new Error(`encoder broke on ${PIN}`);
    });
    expect(await verifyPin(PIN)).toBe(false);
  });

  it('a tampered verifier with odd parameters is treated as none', async () => {
    await savePin(PIN);
    const v = stored();
    secureStore.set(
      PIN_VERIFIER_KEY,
      JSON.stringify({ ...v, params: { N: 2 ** 22, r: 8, p: 1, dkLen: 32 } }),
    );
    expect(await verifyPin(PIN)).toBe(false);
    expect(await hasPinVerifier()).toBe(false);
  });
});

describe('verifier and parameter parsing', () => {
  const good = {
    v: 1,
    alg: 'scrypt',
    params: { N: 4096, r: 8, p: 1, dkLen: 32 },
    salt: 'a'.repeat(32),
    hash: 'b'.repeat(64),
  };

  it('accepts exactly the stored shape', () => {
    expect(parsePinVerifier(JSON.stringify(good))).toEqual(good);
    expect(parsePinVerifier(null)).toBeNull();
    expect(parsePinVerifier('null')).toBeNull();
    expect(parsePinVerifier('[]')).toBeNull();
    for (const bad of [
      { ...good, v: 2 },
      { ...good, alg: 'pbkdf2' },
      { ...good, salt: 'zz' },
      { ...good, salt: 5 },
      { ...good, hash: 'b'.repeat(63) },
      { ...good, hash: null },
      { ...good, params: null },
    ]) {
      expect(parsePinVerifier(JSON.stringify(bad))).toBeNull();
    }
  });

  it('bounds the parameters', () => {
    expect(isValidParams(DEFAULT_KDF_PARAMS)).toBe(true);
    for (const bad of [
      null,
      'x',
      { N: 4000, r: 8, p: 1, dkLen: 32 },
      { N: 512, r: 8, p: 1, dkLen: 32 },
      { N: 2 ** 18, r: 8, p: 1, dkLen: 32 },
      { N: 4096, r: 0, p: 1, dkLen: 32 },
      { N: 4096, r: 1.5, p: 1, dkLen: 32 },
      { N: 4096, r: 8, p: 9, dkLen: 32 },
      { N: 4096, r: 8, p: 0.5, dkLen: 32 },
      { N: 4096, r: 8, p: 1, dkLen: 16 },
      { N: '4096', r: 8, p: 1, dkLen: 32 },
      { N: 4096, r: '8', p: 1, dkLen: 32 },
      { N: 4096, r: 8, p: '1', dkLen: 32 },
    ]) {
      expect(isValidParams(bad)).toBe(false);
    }
  });
});

describe('the gate check', () => {
  it('isSecuritySetupComplete() is true only with a valid verifier', async () => {
    expect(await isSecuritySetupComplete()).toBe(false);
    await savePin(PIN);
    expect(await isSecuritySetupComplete()).toBe(true);
    secureStore.set(PIN_VERIFIER_KEY, '{"v":1}');
    expect(await isSecuritySetupComplete()).toBe(false);
  });

  it('deletePinData removes the verifier and the attempt record', async () => {
    await savePin(PIN);
    await writePinAttempts({ failedAttempts: 2, lockedUntil: null });
    expect(await deletePinData()).toBe(true);
    expect(secureStore.size).toBe(0);
    expect(deleteItemAsync).toHaveBeenCalledWith(PIN_VERIFIER_KEY, SECURE_STORE_OPTIONS);
    deleteItemAsync.mockRejectedValueOnce(new Error('keystore'));
    expect(await deletePinData()).toBe(false);
  });
});

describe('failed-attempt record (for the app-lock task)', () => {
  it('is a separate secure-store record with read / write / clear', async () => {
    expect(await readPinAttempts()).toEqual(NO_ATTEMPTS);
    const record = { failedAttempts: 3, lockedUntil: '2026-11-28T10:00:00.000Z' };
    expect(await writePinAttempts(record)).toBe(true);
    expect(JSON.parse(secureStore.get(PIN_ATTEMPTS_KEY) ?? 'null')).toEqual(record);
    expect(setItemAsync).toHaveBeenLastCalledWith(
      PIN_ATTEMPTS_KEY,
      expect.any(String),
      SECURE_STORE_OPTIONS,
    );
    expect(await readPinAttempts()).toEqual(record);
    await clearPinAttempts();
    expect(await readPinAttempts()).toEqual(NO_ATTEMPTS);
  });

  it('a new PIN starts with no failed attempts', async () => {
    await writePinAttempts({ failedAttempts: 4, lockedUntil: null });
    await savePin(PIN);
    expect(secureStore.has(PIN_ATTEMPTS_KEY)).toBe(false);
  });

  it('malformed or unreadable records count as no attempts; failed writes report false', async () => {
    for (const raw of [
      'x',
      'null',
      '{"failedAttempts":-1,"lockedUntil":null}',
      '{"failedAttempts":1.5,"lockedUntil":null}',
      '{"failedAttempts":1,"lockedUntil":"soon"}',
      '{"failedAttempts":1,"lockedUntil":5}',
      '{"lockedUntil":null}',
    ]) {
      expect([raw, parseAttemptRecord(raw)]).toEqual([raw, NO_ATTEMPTS]);
    }
    expect(parseAttemptRecord('{"failedAttempts":2,"lockedUntil":null}')).toEqual({
      failedAttempts: 2,
      lockedUntil: null,
    });
    getItemAsync.mockRejectedValueOnce(new Error('keystore'));
    expect(await readPinAttempts()).toEqual(NO_ATTEMPTS);
    setItemAsync.mockRejectedValueOnce(new Error('keystore'));
    expect(await writePinAttempts({ failedAttempts: 1, lockedUntil: null })).toBe(false);
  });
});

describe('Diagnostics measurement', () => {
  it('times one derivation with the default parameters on random data', async () => {
    let t = 1000;
    const result = await measurePinHashing(DEFAULT_KDF_PARAMS, () => (t += 321));
    expect(result).toEqual({ ms: 321, params: DEFAULT_KDF_PARAMS });
    expect(secureStore.size).toBe(0); // nothing stored
  });

  it('uses the real clock by default', async () => {
    const { ms } = await measurePinHashing({ N: 1024, r: 8, p: 1, dkLen: 32 });
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});
