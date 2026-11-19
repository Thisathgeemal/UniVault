/**
 * crypto-core security scenario suite (Sprint 1 test task).
 *
 * End-to-end tests through the public API, grouped by the five required
 * scenarios. Test IDs (TC-xx) are referenced in docs/testing/crypto-core-test-report.md.
 */
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSdJwt,
  decodeDisclosures,
  decodeSdJwt,
  generateIssuerKeys,
  issuerKeyFileNames,
  issuerPublicKeyFromJwk,
  loadIssuerPrivateKey,
  loadIssuerPublicJwk,
  saveIssuerKeyPair,
  sha256Hasher,
  verifySdJwt,
  type CredentialClaims,
  type IssuerKeyPair,
  type IssuerPublicJwk,
} from '../src/node/index.js';

const NOW = 1_795_000_000;
const OPTS = { currentDate: NOW + 3600 };
const PASSPHRASE = 'scenario-test-passphrase';

const enc = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');
const dec = (s: string) =>
  JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>;
const split = (token: string) => {
  const parts = token.split('~');
  const jwt = parts[0] ?? '';
  const [h = '', p = '', s = ''] = jwt.split('.');
  return { jwt, h, p, s, disclosures: parts.slice(1, -1) };
};

// KYC credential shaped like docs/schemas/kyc-credential.v1.schema.json
const kycClaims: CredentialClaims = {
  iss: 'https://api.univault.local/issuers/bank-a',
  issuer_name: 'UniVault Demo Bank',
  vct: 'urn:univault:vct:KYCCredential:1',
  schema_version: '1.0',
  jti: '0b8e6a52-3f0e-4d4a-9a2e-6a7c1d2e3f40',
  iat: NOW,
  exp: NOW + 2 * 365 * 24 * 3600,
  cnf: { jwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' } },
  status: { status_uri: 'https://api.univault.local/status/0b8e6a52' },
  kyc_verification_date: '2026-11-01',
  full_name: 'ලහිරු සිල්වා',
  id_document_type: 'nic',
  id_document_number: '199935300063',
  date_of_birth: '1999-12-18',
  age_over_18: true,
  nationality: 'LK',
  permanent_address: {
    line1: 'No. 12, Temple Road',
    city: 'Kandy',
    district: 'Kandy',
    postal_code: '20000',
    country: 'LK',
  },
  mobile_number: '+94770001234',
};
const kycDisclosable = [
  'full_name',
  'id_document_type',
  'id_document_number',
  'date_of_birth',
  'age_over_18',
  'nationality',
  'permanent_address',
  'mobile_number',
];

let keysDir: string;
let bank: IssuerKeyPair;
let otherBank: IssuerKeyPair;
let token: string;

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-scenarios-'));
  [bank, otherBank] = await Promise.all([
    generateIssuerKeys({ passphrase: PASSPHRASE }),
    generateIssuerKeys(),
  ]);
  await saveIssuerKeyPair(keysDir, bank);
  const privateKey = await loadIssuerPrivateKey(keysDir, bank.kid, PASSPHRASE);
  token = await createSdJwt(kycClaims, kycDisclosable, { kid: bank.kid, privateKey });
});

afterAll(async () => {
  await rm(keysDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('S1 – Valid signature passes', () => {
  it('TC-01 full lifecycle: encrypted key saved → loaded → credential issued → verified', async () => {
    const publicJwk = await loadIssuerPublicJwk(keysDir, bank.kid);
    const r = await verifySdJwt(token, publicJwk, OPTS);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.claims).toEqual(kycClaims);
  });

  it('TC-02 a presentation revealing only age_over_18 still verifies', async () => {
    const { jwt, disclosures } = split(token);
    const age = disclosures.find(
      (d) => (JSON.parse(Buffer.from(d, 'base64url').toString()) as unknown[])[1] === 'age_over_18',
    );
    const r = await verifySdJwt([jwt, age, ''].join('~'), bank.publicJwk, OPTS);
    expect(r.valid).toBe(true);
    expect(r.disclosedClaimNames).toEqual(['age_over_18']);
    expect(r.undisclosedCount).toBe(kycDisclosable.length - 1);
    expect(r.claims).not.toHaveProperty('date_of_birth');
  });

  it('TC-03 a credential signed with a 3072-bit key verifies', async () => {
    const big = await generateIssuerKeys({ modulusLength: 3072 });
    const t = await createSdJwt(kycClaims, kycDisclosable, {
      kid: big.kid,
      privateKey: big.privateKeyPem,
    });
    expect((await verifySdJwt(t, big.publicJwk, OPTS)).valid).toBe(true);
  });

  it('TC-04 verification also works with a KeyObject public key', async () => {
    const r = await verifySdJwt(token, issuerPublicKeyFromJwk(bank.publicJwk), OPTS);
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('S2 – Tampered credential payload fails', () => {
  const tamperPayload = (change: (p: Record<string, unknown>) => Record<string, unknown>) => {
    const { h, p, s, disclosures } = split(token);
    return [`${h}.${enc(change(dec(p)))}.${s}`, ...disclosures, ''].join('~');
  };

  it.each([
    [
      'TC-05 visible claim changed (issuer_name)',
      (p: Record<string, unknown>) => ({ ...p, issuer_name: 'Fake Bank' }),
    ],
    [
      'TC-06 expiry extended by 50 years',
      (p: Record<string, unknown>) => ({ ...p, exp: NOW + 50 * 365 * 24 * 3600 }),
    ],
    [
      'TC-07 visible claim removed (status)',
      (p: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'status')),
    ],
    [
      'TC-08 claim added (public_position)',
      (p: Record<string, unknown>) => ({ ...p, public_position: 'Minister' }),
    ],
    [
      'TC-09 digest removed from _sd',
      (p: Record<string, unknown>) => ({ ...p, _sd: (p._sd as string[]).slice(1) }),
    ],
    [
      'TC-10 holder key replaced in cnf (credential theft)',
      (p: Record<string, unknown>) => ({
        ...p,
        cnf: { jwk: { kty: 'EC', crv: 'P-256', x: 'attacker', y: 'attacker' } },
      }),
    ],
  ])('%s → INVALID_SIGNATURE', async (_label, change) => {
    const r = await verifySdJwt(tamperPayload(change), bank.publicJwk, OPTS);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('INVALID_SIGNATURE');
    expect(r.claims).toBeUndefined();
  });

  it('TC-11 header changed to alg "none" with the signature stripped', async () => {
    const { h, p, disclosures } = split(token);
    const r = await verifySdJwt(
      [`${enc({ ...dec(h), alg: 'none' })}.${p}.`, ...disclosures, ''].join('~'),
      bank.publicJwk,
      OPTS,
    );
    expect(r.valid).toBe(false);
  });

  it('TC-12 credential issued by a different bank using the real kid (impostor)', async () => {
    const forged = await createSdJwt(kycClaims, kycDisclosable, {
      kid: bank.kid,
      privateKey: otherBank.privateKeyPem,
    });
    const r = await verifySdJwt(forged, bank.publicJwk, OPTS);
    expect(r.errors).toEqual(['INVALID_SIGNATURE']);
  });
});

// ---------------------------------------------------------------------------
describe('S3 – Tampered disclosure fails', () => {
  const editDisclosure = (name: string, newValue: unknown) => {
    const { jwt, disclosures } = split(token);
    return [
      jwt,
      ...disclosures.map((d) => {
        const [salt, n] = JSON.parse(Buffer.from(d, 'base64url').toString()) as [string, string];
        return n === name ? enc([salt, n, newValue]) : d;
      }),
      '',
    ].join('~');
  };

  it('TC-13 date_of_birth edited (signature still valid, disclosure rejected)', async () => {
    const r = await verifySdJwt(
      editDisclosure('date_of_birth', '2012-01-01'),
      bank.publicJwk,
      OPTS,
    );
    expect(r.valid).toBe(false);
    expect(r.checks.find((c) => c.name === 'signature')?.status).toBe('pass');
    expect(r.errors).toEqual(['DISCLOSURE_NOT_IN_SD']);
  });

  it('TC-14 age_over_18 flipped from true to false', async () => {
    const r = await verifySdJwt(editDisclosure('age_over_18', false), bank.publicJwk, OPTS);
    expect(r.errors).toEqual(['DISCLOSURE_NOT_IN_SD']);
  });

  it('TC-15 completely forged disclosure', async () => {
    const { jwt } = split(token);
    const r = await verifySdJwt(
      [jwt, enc(['forged-salt-0000000000', 'public_position', 'Minister']), ''].join('~'),
      bank.publicJwk,
      OPTS,
    );
    expect(r.errors).toEqual(['DISCLOSURE_NOT_IN_SD']);
  });

  it('TC-16 disclosure spliced in from ANOTHER credential of the same bank', async () => {
    // Attacker copies a genuine, bank-signed disclosure from someone else's credential
    const other = await createSdJwt(
      { ...kycClaims, full_name: 'Someone Else', date_of_birth: '1980-01-01' },
      kycDisclosable,
      { kid: bank.kid, privateKey: await loadIssuerPrivateKey(keysDir, bank.kid, PASSPHRASE) },
    );
    const stolenDob = split(other).disclosures.find(
      (d) =>
        (JSON.parse(Buffer.from(d, 'base64url').toString()) as unknown[])[1] === 'date_of_birth',
    );
    const { jwt } = split(token);
    const r = await verifySdJwt([jwt, stolenDob, ''].join('~'), bank.publicJwk, OPTS);
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['DISCLOSURE_NOT_IN_SD']);
  });

  it('TC-17 duplicated disclosure', async () => {
    const { jwt, disclosures } = split(token);
    const r = await verifySdJwt(
      [jwt, disclosures[0], disclosures[0], ''].join('~'),
      bank.publicJwk,
      OPTS,
    );
    expect(r.errors).toEqual(['DUPLICATE_DISCLOSURE']);
  });

  it('TC-18 decodeDisclosures rejects the same tampering without the verifier', () => {
    const r = decodeDisclosures(editDisclosure('full_name', 'Fake Name'));
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(['DISCLOSURE_NOT_IN_SD']);
    expect(r.disclosures.map((d) => d.name)).not.toContain('full_name');
  });
});

// ---------------------------------------------------------------------------
describe('S4 – Valid disclosures are decoded correctly', () => {
  it('TC-19 every claim value round-trips exactly (text, Sinhala, boolean, object)', () => {
    const r = decodeDisclosures(token);
    expect(r.valid).toBe(true);
    const values = Object.fromEntries(r.disclosures.map((d) => [d.name, d.value]));
    for (const name of kycDisclosable) expect(values[name]).toEqual(kycClaims[name]);
  });

  it('TC-20 recalculated digests equal Node SHA-256 and appear in the signed _sd', () => {
    const { p } = split(token);
    const sd = dec(p)._sd as string[];
    for (const d of decodeDisclosures(token).disclosures) {
      expect(d.digest).toBe(createHash('sha256').update(d.encoded).digest('base64url'));
      expect(sd).toContain(d.digest);
    }
  });

  it('TC-21 a partial presentation decodes only the revealed claims', () => {
    const { jwt, disclosures } = split(token);
    const r = decodeDisclosures([jwt, disclosures[0], disclosures[3], ''].join('~'));
    expect(r.disclosures).toHaveLength(2);
    expect(r.undisclosedDigests).toHaveLength(kycDisclosable.length - 2);
  });

  it('TC-22 decodeSdJwt inspects a presentation including its key-binding JWT', async () => {
    const kb = `${enc({ alg: 'ES256', typ: 'kb+jwt' })}.${enc({ nonce: 'n-123', aud: 'verifier' })}.c2ln`;
    const decoded = await decodeSdJwt(`${token}${kb}`);
    expect(decoded.claims.full_name).toBe('ලහිරු සිල්වා');
    expect(decoded.keyBindingJwt?.payload).toEqual({ nonce: 'n-123', aud: 'verifier' });
  });
});

// ---------------------------------------------------------------------------
describe('S5 – Invalid credential data is handled appropriately', () => {
  it.each([
    ['TC-23 empty string', ''],
    ['TC-24 random text', 'hello world'],
    ['TC-25 JWT without disclosures separator', 'eyJhbGciOiJSUzI1NiJ9.e30.c2ln'],
    ['TC-26 null', null],
    ['TC-27 undefined', undefined],
    ['TC-28 number', 12345],
    ['TC-29 object', { token: 'x' }],
  ])('%s → verifySdJwt returns MALFORMED_TOKEN without throwing', async (_label, bad) => {
    const r = await verifySdJwt(bad as unknown as string, bank.publicJwk, OPTS);
    expect(r).toMatchObject({ valid: false, errors: ['MALFORMED_TOKEN'] });
  });

  it('TC-30 invalid public key argument throws a clear TypeError', async () => {
    await expect(verifySdJwt(token, null as unknown as IssuerPublicJwk)).rejects.toThrow(TypeError);
  });

  it('TC-31 a non-RSA public key fails the signature check instead of crashing', async () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const r = await verifySdJwt(token, ec.publicKey, OPTS);
    expect(r.errors).toEqual(['INVALID_SIGNATURE']);
  });

  it('TC-32 decodeDisclosures rejects non-string input and non-object payloads', () => {
    expect(() => decodeDisclosures(42 as unknown as string)).toThrow(TypeError);
    expect(() => decodeDisclosures(`${enc({ alg: 'RS256' })}.${enc([1, 2])}.c2ln~`)).toThrow(
      /not a JSON object/,
    );
  });

  it('TC-33 decodeSdJwt rejects array-element disclosures (not used by UniVault)', async () => {
    const { jwt } = split(token);
    await expect(
      decodeSdJwt([jwt, enc(['salt-0000000000000000', 'value-only']), ''].join('~')),
    ).rejects.toThrow();
  });

  it('TC-34 createSdJwt rejects claims that are not a plain object', async () => {
    const key = { kid: otherBank.kid, privateKey: otherBank.privateKeyPem };
    await expect(createSdJwt([] as unknown as CredentialClaims, [], key)).rejects.toThrow(
      /plain object/,
    );
    await expect(createSdJwt(null as unknown as CredentialClaims, [], key)).rejects.toThrow(
      /plain object/,
    );
  });

  it('TC-35 a tampered public key file is detected on load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'univault-tamper-'));
    try {
      const keys = await generateIssuerKeys({ passphrase: PASSPHRASE });
      await saveIssuerKeyPair(dir, keys);
      const swapped = { ...otherBank.publicJwk, kid: keys.kid }; // attacker swaps n/e, keeps kid
      await writeFile(
        join(dir, issuerKeyFileNames(keys.kid).publicJwk),
        JSON.stringify(swapped),
        'utf8',
      );
      await expect(loadIssuerPublicJwk(dir, keys.kid)).rejects.toThrow(/does not match/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('TC-36 the hasher rejects unsupported algorithms and accepts binary input', () => {
    expect(() => sha256Hasher('data', 'sha-1')).toThrow(/Unsupported/);
    const bytes = new TextEncoder().encode('univault');
    expect(Buffer.from(sha256Hasher(bytes.buffer as ArrayBuffer)).toString('hex')).toBe(
      createHash('sha256').update('univault').digest('hex'),
    );
  });
});
