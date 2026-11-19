import { createSign, generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createSdJwt,
  generateIssuerKeys,
  issuerPublicKeyFromJwk,
  verifySdJwt,
  type CheckName,
  type CredentialClaims,
  type IssuerKeyPair,
  type SdJwtVerificationResult,
} from '../src/node/index.js';

const NOW = 1_795_000_000;
const claims: CredentialClaims = {
  iss: 'https://api.univault.local/issuers/employer-a',
  issuer_name: 'Serendib Trading Company (Demo)',
  vct: 'urn:univault:vct:EmploymentCredential:1',
  iat: NOW,
  nbf: NOW,
  exp: NOW + 365 * 24 * 3600,
  employee_id: 'STC-00001',
  full_name: 'Lahiru Silva',
  designation: 'Logistics Coordinator',
  department: 'Operations',
};
const disclosable = ['employee_id', 'full_name', 'designation', 'department'];
const opts = { currentDate: NOW + 3600 };

const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const dec = (s: string) =>
  JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>;
const status = (r: SdJwtVerificationResult, name: CheckName) =>
  r.checks.find((c) => c.name === name)?.status;

let issuer: IssuerKeyPair;
let otherIssuer: IssuerKeyPair;
let token: string;
let jwt: string;
let disclosures: string[];

/** Re-assemble a token with a modified issuer JWT part. */
const withJwt = (newJwt: string) => [newJwt, ...disclosures, ''].join('~');

beforeAll(async () => {
  [issuer, otherIssuer] = await Promise.all([generateIssuerKeys(), generateIssuerKeys()]);
  token = await createSdJwt(claims, disclosable, {
    kid: issuer.kid,
    privateKey: issuer.privateKeyPem,
  });
  const parts = token.split('~');
  jwt = parts[0] ?? '';
  disclosures = parts.slice(1, -1);
});

describe('valid credentials pass', () => {
  it('passes every check and returns the full claim set', async () => {
    const r = await verifySdJwt(token, issuer.publicJwk, opts);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.checks.map((c) => [c.name, c.status])).toEqual([
      ['format', 'pass'],
      ['algorithm', 'pass'],
      ['key_id', 'pass'],
      ['signature', 'pass'],
      ['disclosures', 'pass'],
      ['expiry', 'pass'],
      ['not_before', 'pass'],
    ]);
    expect(r.claims).toEqual(claims);
    expect(r.disclosedClaimNames.sort()).toEqual([...disclosable].sort());
    expect(r.undisclosedCount).toBe(0);
  });

  it('accepts a KeyObject (kid check skipped)', async () => {
    const r = await verifySdJwt(token, issuerPublicKeyFromJwk(issuer.publicJwk), opts);
    expect(r.valid).toBe(true);
    expect(status(r, 'key_id')).toBe('skipped');
  });

  it('passes a presentation that reveals only some claims', async () => {
    const subset = [jwt, disclosures[0], disclosures[1], ''].join('~');
    const r = await verifySdJwt(subset, issuer.publicJwk, opts);
    expect(r.valid).toBe(true);
    expect(r.disclosedClaimNames).toHaveLength(2);
    expect(r.undisclosedCount).toBe(2);
    expect(Object.keys(r.claims ?? {}).filter((k) => disclosable.includes(k))).toHaveLength(2);
  });

  it('verifies the issuer part of a presentation with a key-binding JWT attached', async () => {
    const r = await verifySdJwt(`${token}eyJhbGciOiJFUzI1NiJ9.e30.c2ln`, issuer.publicJwk, opts);
    expect(r.valid).toBe(true);
    expect(r.hasKeyBinding).toBe(true);
  });
});

describe('modified payloads fail', () => {
  it('detects a changed visible claim', async () => {
    const [h, p, s] = jwt.split('.');
    const tampered = { ...dec(p ?? ''), issuer_name: 'Fake Bank PLC' };
    const r = await verifySdJwt(withJwt(`${h}.${enc(tampered)}.${s}`), issuer.publicJwk, opts);
    expect(r.valid).toBe(false);
    expect(status(r, 'signature')).toBe('fail');
    expect(r.errors).toContain('INVALID_SIGNATURE');
    expect(r.claims).toBeUndefined();
  });

  it('detects an extended expiry date', async () => {
    const [h, p, s] = jwt.split('.');
    const tampered = { ...dec(p ?? ''), exp: NOW + 100 * 365 * 24 * 3600 };
    const r = await verifySdJwt(withJwt(`${h}.${enc(tampered)}.${s}`), issuer.publicJwk, opts);
    expect(r.errors).toContain('INVALID_SIGNATURE');
  });

  it('detects a digest swapped in _sd (attempt to authorise a forged claim)', async () => {
    const [h, p, s] = jwt.split('.');
    const payload = dec(p ?? '') as { _sd: string[] };
    const forgedDisclosure = enc(['salt', 'designation', 'CEO']);
    const forgedDigest = (await import('node:crypto'))
      .createHash('sha256')
      .update(forgedDisclosure)
      .digest('base64url');
    const tampered = { ...payload, _sd: [...payload._sd.slice(1), forgedDigest] };
    const r = await verifySdJwt(
      [`${h}.${enc(tampered)}.${s}`, forgedDisclosure, ''].join('~'),
      issuer.publicJwk,
      opts,
    );
    expect(r.valid).toBe(false);
    expect(status(r, 'signature')).toBe('fail');
  });

  it('detects a forged disclosure even though the issuer signature is intact', async () => {
    const forged = enc(['someSalt', 'designation', 'Chief Executive Officer']);
    const r = await verifySdJwt([jwt, forged, ''].join('~'), issuer.publicJwk, opts);
    expect(r.valid).toBe(false);
    expect(status(r, 'signature')).toBe('pass');
    expect(status(r, 'disclosures')).toBe('fail');
    expect(r.errors).toEqual(['DISCLOSURE_NOT_IN_SD']);
  });

  it('detects a disclosure whose value was edited', async () => {
    const [salt, name] = JSON.parse(Buffer.from(disclosures[0] ?? '', 'base64url').toString()) as [
      string,
      string,
    ];
    const edited = enc([salt, name, 'EDITED']);
    const r = await verifySdJwt([jwt, edited, ''].join('~'), issuer.publicJwk, opts);
    expect(r.errors).toContain('DISCLOSURE_NOT_IN_SD');
  });

  it('rejects a duplicated disclosure', async () => {
    const r = await verifySdJwt(
      [jwt, disclosures[0], disclosures[0], ''].join('~'),
      issuer.publicJwk,
      opts,
    );
    expect(r.errors).toContain('DUPLICATE_DISCLOSURE');
  });

  it('rejects a malformed disclosure', async () => {
    const r = await verifySdJwt(
      [jwt, enc({ not: 'an array' }), ''].join('~'),
      issuer.publicJwk,
      opts,
    );
    expect(r.errors).toContain('MALFORMED_DISCLOSURE');
  });
});

describe('invalid signatures are rejected', () => {
  it('rejects a credential verified with another issuer key', async () => {
    const r = await verifySdJwt(token, issuerPublicKeyFromJwk(otherIssuer.publicJwk), opts);
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['INVALID_SIGNATURE']);
  });

  it('rejects a credential signed by an impostor using the real kid', async () => {
    const impostor = await createSdJwt(claims, disclosable, {
      kid: issuer.kid,
      privateKey: otherIssuer.privateKeyPem,
    });
    const r = await verifySdJwt(impostor, issuer.publicJwk, opts);
    expect(status(r, 'key_id')).toBe('pass');
    expect(r.errors).toEqual(['INVALID_SIGNATURE']);
  });

  it('flags a kid that does not match the issuer key', async () => {
    const r = await verifySdJwt(token, otherIssuer.publicJwk, opts);
    expect(r.errors).toEqual(expect.arrayContaining(['KEY_ID_MISMATCH', 'INVALID_SIGNATURE']));
  });

  it.each([
    ['random bytes', Buffer.alloc(256, 7).toString('base64url')],
    ['truncated signature', 'AAAA'],
    [
      'signature over different data',
      createSign('RSA-SHA256')
        .update('other')
        .sign(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey)
        .toString('base64url'),
    ],
  ])('rejects %s', async (_label, badSig) => {
    const [h, p] = jwt.split('.');
    const r = await verifySdJwt(withJwt(`${h}.${p}.${badSig}`), issuer.publicJwk, opts);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('INVALID_SIGNATURE');
  });

  it.each(['none', 'HS256', 'ES256'])(
    'rejects alg "%s" in the header (algorithm substitution)',
    async (alg) => {
      const [h, p, s] = jwt.split('.');
      const header = { ...dec(h ?? ''), alg };
      const r = await verifySdJwt(withJwt(`${enc(header)}.${p}.${s}`), issuer.publicJwk, opts);
      expect(r.valid).toBe(false);
      expect(r.errors).toEqual(
        expect.arrayContaining(['UNSUPPORTED_ALGORITHM', 'INVALID_SIGNATURE']),
      );
    },
  );
});

describe('malformed tokens never throw', () => {
  it.each([
    ['empty string', ''],
    ['plain JWT without ~', jwt],
    ['two-part JWT', 'eyJhbGciOiJSUzI1NiJ9.e30~'],
    ['not Base64URL', 'abc.d$f.ghi~'],
    ['header not JSON', `${Buffer.from('not json').toString('base64url')}.e30.c2ln~`],
    ['payload is an array', `${enc({ alg: 'RS256' })}.${enc([1, 2])}.c2ln~`],
  ])('returns MALFORMED_TOKEN for %s', async (_label, bad) => {
    const r = await verifySdJwt(bad, issuer.publicJwk, opts);
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['MALFORMED_TOKEN']);
  });
});

describe('validity period', () => {
  it('fails an expired credential', async () => {
    const r = await verifySdJwt(token, issuer.publicJwk, {
      currentDate: (claims.exp as number) + 3600,
    });
    expect(r.errors).toEqual(['EXPIRED']);
  });

  it('fails a credential used before nbf', async () => {
    const r = await verifySdJwt(token, issuer.publicJwk, { currentDate: NOW - 3600 });
    expect(r.errors).toEqual(['NOT_YET_VALID']);
  });

  it('allows a small clock difference', async () => {
    const r = await verifySdJwt(token, issuer.publicJwk, {
      currentDate: NOW - 30,
      clockSkewSeconds: 60,
    });
    expect(r.valid).toBe(true);
  });

  it('can skip time checks', async () => {
    const r = await verifySdJwt(token, issuer.publicJwk, {
      currentDate: (claims.exp as number) + 3600,
      checkTime: false,
    });
    expect(r.valid).toBe(true);
    expect(status(r, 'expiry')).toBe('skipped');
  });
});

describe('result format', () => {
  it('is plain JSON (safe to log or send to the verifier portal)', async () => {
    const r = await verifySdJwt(token, issuer.publicJwk, opts);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    for (const c of r.checks) expect(c.detail.length).toBeGreaterThan(0);
  });
});
