/**
 * crypto-core in the wallet: the Diagnostics check decodes the bundled synthetic SD-JWT with the
 * SHARED library (universal entry) in this Jest environment, and fails on tampering. Plus the
 * Hermes runtime setup (getRandomValues polyfill, capability checks).
 */
import { getRandomValues } from 'expo-crypto';
import { DIAGNOSTICS_CREDENTIAL } from '../src/fixtures/diagnostics-credential';
import { runCryptoCoreCheck } from '../src/lib/crypto-check';
import {
  assertCryptoRuntime,
  installGetRandomValues,
  runtimeCapabilities,
} from '../src/lib/crypto-setup';

const clock = () => {
  let t = 1000;
  return () => (t += 5);
};

describe('crypto-core check (same fixture as the Diagnostics screen)', () => {
  it('passes: every disclosure decodes and its digest is in _sd', async () => {
    const result = await runCryptoCoreCheck(DIAGNOSTICS_CREDENTIAL, clock());
    expect(result).toEqual({
      pass: true,
      disclosures: 5,
      expectedDisclosures: 5,
      durationMs: 5,
      failure: null,
    });
  });

  it('fails on a forged disclosure (digest not in _sd)', async () => {
    const [jwt, first, ...rest] = DIAGNOSTICS_CREDENTIAL.sdJwt.split('~');
    // A different, well-formed disclosure for an existing claim name: not signed by the issuer
    const forged = Buffer.from(JSON.stringify(['c2FsdA', 'designation', 'Director'])).toString(
      'base64url',
    );
    expect(first).toBeDefined();
    const tampered = [jwt, forged, ...rest].join('~');
    const result = await runCryptoCoreCheck({ ...DIAGNOSTICS_CREDENTIAL, sdJwt: tampered });
    expect(result.pass).toBe(false);
    expect(result.failure).toBeTruthy();
  });

  it('fails when the credential type is not the expected one', async () => {
    const result = await runCryptoCoreCheck({ ...DIAGNOSTICS_CREDENTIAL, vct: 'urn:other' });
    expect(result).toMatchObject({ pass: false, failure: 'WRONG_VCT' });
  });

  it('fails when the expected disclosures differ', async () => {
    const result = await runCryptoCoreCheck({
      ...DIAGNOSTICS_CREDENTIAL,
      disclosedClaims: ['employee_id', 'nic_number'],
    });
    expect(result).toMatchObject({ pass: false, failure: 'WRONG_DISCLOSURES' });
  });

  it('fails (without throwing) on something that is not an SD-JWT', async () => {
    const result = await runCryptoCoreCheck({ ...DIAGNOSTICS_CREDENTIAL, sdJwt: 'not-a-jwt' });
    expect(result.pass).toBe(false);
    expect(result.disclosures).toBe(0);
  });

  it('reports a non-Error throw by a generic name', async () => {
    const fixture = Object.defineProperty({ ...DIAGNOSTICS_CREDENTIAL }, 'sdJwt', {
      get(): string {
        throw 'boom';
      },
    });
    const result = await runCryptoCoreCheck(fixture);
    expect(result).toMatchObject({ pass: false, failure: 'Error' });
  });

  it('the fixture is synthetic: example issuer, no private key material', () => {
    const [jwt] = DIAGNOSTICS_CREDENTIAL.sdJwt.split('~');
    const payload = JSON.parse(
      Buffer.from(jwt?.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown> & { cnf: { jwk: Record<string, unknown> } };
    expect(payload.iss).toBe('https://issuer.example/univault-diagnostics');
    expect(payload.cnf.jwk).not.toHaveProperty('d');
    expect(DIAGNOSTICS_CREDENTIAL.sdJwt).not.toMatch(/PRIVATE KEY/);
  });
});

describe('crypto runtime setup (Hermes polyfills)', () => {
  it('installs crypto.getRandomValues from expo-crypto when missing', () => {
    const target: { crypto?: { getRandomValues?: <T>(a: T) => T } } = {};
    installGetRandomValues(target);
    const bytes = new Uint8Array(16);
    expect(target.crypto?.getRandomValues?.(bytes)).toBe(bytes);
    expect(getRandomValues).toBeDefined();
    expect(target.crypto?.getRandomValues?.(null)).toBeNull();
  });

  it('keeps an existing getRandomValues', () => {
    const existing = <T>(a: T) => a;
    const target = { crypto: { getRandomValues: existing } };
    installGetRandomValues(target);
    expect(target.crypto.getRandomValues).toBe(existing);
  });

  it('reports the globals the libraries need, all present here', () => {
    expect(runtimeCapabilities()).toEqual({
      getRandomValues: true,
      TextEncoder: true,
      TextDecoder: true,
      BigInt: true,
    });
    expect(() => assertCryptoRuntime()).not.toThrow();
  });

  it('names what is missing', () => {
    const original = globalThis.TextDecoder;
    // @ts-expect-error simulate an engine without TextDecoder
    delete globalThis.TextDecoder;
    try {
      expect(() => assertCryptoRuntime()).toThrow(/lacks TextDecoder/);
    } finally {
      globalThis.TextDecoder = original;
    }
  });
});
