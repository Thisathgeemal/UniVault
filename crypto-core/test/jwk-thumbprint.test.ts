import { createHash, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeEcJwkThumbprint } from '../src/index.js';

// Example P-256 public key from RFC 7517 Appendix A.1. The expected thumbprint was
// cross-checked with jose's calculateJwkThumbprint (an independent implementation).
const RFC7517_EC_KEY = {
  kty: 'EC',
  crv: 'P-256',
  x: 'MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4',
  y: '4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM',
};
const RFC7517_EC_THUMBPRINT = 'cn-I_WNMClehiVp51i_0VpOENW1upEerA8sEam5hn-s';

function walletJwk() {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string };
}

describe('computeEcJwkThumbprint', () => {
  it('matches the known thumbprint of the RFC 7517 A.1 P-256 key', () => {
    expect(computeEcJwkThumbprint(RFC7517_EC_KEY)).toBe(RFC7517_EC_THUMBPRINT);
  });

  it('hashes exactly {"crv","kty","x","y"} in that order, whatever the input order', () => {
    const jwk = walletJwk();
    const reordered = { y: jwk.y, x: jwk.x, kty: jwk.kty, crv: jwk.crv };
    const expected = createHash('sha256')
      .update(`{"crv":"${jwk.crv}","kty":"EC","x":"${jwk.x}","y":"${jwk.y}"}`)
      .digest('base64url');
    expect(computeEcJwkThumbprint(reordered)).toBe(expected);
    expect(computeEcJwkThumbprint(jwk)).toBe(expected);
  });

  it('ignores non-required members such as kid, alg, use and d', () => {
    const withExtras = { ...RFC7517_EC_KEY, kid: 'k1', alg: 'ES256', use: 'sig', d: 'secret' };
    expect(computeEcJwkThumbprint(withExtras)).toBe(RFC7517_EC_THUMBPRINT);
  });

  it('gives a 43-character Base64URL value that differs between keys', () => {
    const a = computeEcJwkThumbprint(walletJwk());
    const b = computeEcJwkThumbprint(walletJwk());
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('rejects non-EC keys', () => {
    expect(() => computeEcJwkThumbprint({ ...RFC7517_EC_KEY, kty: 'RSA' })).toThrow(/EC JWK/);
  });

  it.each(['crv', 'x', 'y'] as const)('rejects a key without "%s"', (member) => {
    const jwk: Record<string, unknown> = { ...RFC7517_EC_KEY };
    delete jwk[member];
    expect(() => computeEcJwkThumbprint(jwk as never)).toThrow(`"${member}" is required`);
  });

  it('rejects coordinates that are not Base64URL', () => {
    expect(() => computeEcJwkThumbprint({ ...RFC7517_EC_KEY, x: 'not+base64/url=' })).toThrow(
      /Base64URL/,
    );
  });

  it('rejects a non-object', () => {
    expect(() => computeEcJwkThumbprint(null as never)).toThrow(TypeError);
  });
});
