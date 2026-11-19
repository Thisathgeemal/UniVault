import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SdJwtInstance } from '@sd-jwt/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createSdJwt,
  decodeSdJwt,
  generateIssuerKeys,
  issuerPublicKeyFromJwk,
  loadIssuerPrivateKey,
  saveIssuerKeyPair,
  sha256Hasher,
  type CredentialClaims,
  type IssuerKeyPair,
  type IssuerSigningKey,
} from '../src/node/index.js';

// Employment credential shaped like docs/schemas (envelope + subject claims)
const now = 1_795_000_000;
const claims: CredentialClaims = {
  iss: 'https://api.univault.local/issuers/employer-a',
  issuer_name: 'Serendib Trading Company (Demo)',
  vct: 'urn:univault:vct:EmploymentCredential:1',
  schema_version: '1.0',
  jti: '6f1c2b1e-1b7a-4a43-9a51-0d0f0d1c0e11',
  iat: now,
  exp: now + 365 * 24 * 3600,
  cnf: { jwk: { kty: 'EC', crv: 'P-256', x: 'test-x', y: 'test-y' } },
  status: { status_uri: 'https://api.univault.local/status/6f1c2b1e' },
  employee_id: 'STC-00001',
  full_name: 'Lahiru Silva',
  designation: 'Logistics Coordinator',
  department: 'Operations',
  employment_type: 'contract',
  date_of_joining: '2019-07-03',
  work_location: 'Kandy Branch',
};
const disclosable = [
  'employee_id',
  'full_name',
  'designation',
  'department',
  'employment_type',
  'date_of_joining',
  'work_location',
];
const envelope = Object.keys(claims).filter((k) => !disclosable.includes(k));

const b64urlJson = (s: string): unknown => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
const sha256B64url = (s: string): string =>
  createHash('sha256').update(s, 'ascii').digest('base64url');

let issuerKeys: IssuerKeyPair;
let signingKey: IssuerSigningKey;
let sdJwt: string;
let jwt: string;
let disclosures: string[];

beforeAll(async () => {
  issuerKeys = await generateIssuerKeys();
  signingKey = { kid: issuerKeys.kid, privateKey: issuerKeys.privateKeyPem };
  sdJwt = await createSdJwt(claims, disclosable, signingKey);
  const parts = sdJwt.split('~');
  jwt = parts[0] ?? '';
  disclosures = parts.slice(1, -1);
});

describe('createSdJwt – output format', () => {
  it('returns <JWT>~<disclosure>~…~ with one disclosure per disclosable field', () => {
    expect(sdJwt.endsWith('~')).toBe(true);
    expect(jwt.split('.')).toHaveLength(3);
    expect(disclosures).toHaveLength(disclosable.length);
  });

  it('sets the JOSE header: alg RS256, typ dc+sd-jwt, kid of the issuer key', () => {
    const [h] = jwt.split('.');
    expect(b64urlJson(h ?? '')).toEqual({ alg: 'RS256', typ: 'dc+sd-jwt', kid: issuerKeys.kid });
  });
});

describe('createSdJwt – selective disclosure', () => {
  it('removes disclosable claims from the signed payload and keeps envelope claims visible', () => {
    const payload = b64urlJson(jwt.split('.')[1] ?? '') as Record<string, unknown>;
    for (const field of disclosable) expect(payload).not.toHaveProperty(field);
    for (const field of envelope) expect(payload[field]).toEqual(claims[field]);
    expect(payload._sd_alg).toBe('sha-256');
  });

  it('builds each disclosure as a Base64URL-encoded [salt, name, value] array', () => {
    for (const d of disclosures) expect(d).toMatch(/^[A-Za-z0-9_-]+$/); // Base64URL, no padding
    const decoded = disclosures.map((d) => b64urlJson(d) as [string, string, unknown]);
    for (const arr of decoded) expect(arr).toHaveLength(3);
    expect(decoded.map(([, name]) => name).sort()).toEqual([...disclosable].sort());
    for (const [, name, value] of decoded) expect(value).toEqual(claims[name]);
  });

  it('uses a random salt of at least 128 bits, unique per disclosure and per issuance', async () => {
    const salts = disclosures.map((d) => (b64urlJson(d) as [string])[0]);
    for (const salt of salts)
      expect(Buffer.from(salt, 'base64url').length).toBeGreaterThanOrEqual(16);
    expect(new Set(salts).size).toBe(salts.length);

    const again = await createSdJwt(claims, disclosable, signingKey);
    const saltsAgain = again
      .split('~')
      .slice(1, -1)
      .map((d) => (b64urlJson(d) as [string])[0]);
    expect(saltsAgain.some((s) => salts.includes(s))).toBe(false);
  });

  it('puts the SHA-256 digest of every disclosure (and nothing else) in _sd', () => {
    const payload = b64urlJson(jwt.split('.')[1] ?? '') as { _sd: string[] };
    const expected = disclosures.map(sha256B64url);
    expect([...payload._sd].sort()).toEqual([...expected].sort());
  });

  it('pure-JS hasher (used by the wallet) gives the same digests as Node crypto', () => {
    for (const d of disclosures) {
      expect(Buffer.from(sha256Hasher(d)).toString('base64url')).toBe(sha256B64url(d));
    }
  });

  it('discloses an object value (e.g. an address) as one unit', async () => {
    const address = {
      line1: 'No. 12, Temple Road',
      city: 'Kandy',
      district: 'Kandy',
      postal_code: '20000',
      country: 'LK',
    };
    const kyc = await createSdJwt(
      { iss: claims.iss, permanent_address: address },
      ['permanent_address'],
      signingKey,
    );
    const [, d] = kyc.split('~');
    expect(b64urlJson(d ?? '')).toEqual([expect.any(String), 'permanent_address', address]);
  });

  it('keeps every claim visible when no field is disclosable', async () => {
    const plain = await createSdJwt(claims, [], signingKey);
    const decoded = await decodeSdJwt(plain);
    expect(decoded.disclosures).toHaveLength(0);
    expect(decoded.payload.full_name).toBe('Lahiru Silva');
  });
});

describe('createSdJwt – RS256 signature', () => {
  it('is signed with the issuer private key and verifies with the published JWK', () => {
    const [h, p, s] = jwt.split('.');
    const publicKey = issuerPublicKeyFromJwk(issuerKeys.publicJwk);
    const verify = (data: string) =>
      createVerify('RSA-SHA256')
        .update(data)
        .verify(publicKey, Buffer.from(s ?? '', 'base64url'));
    expect(verify(`${h}.${p}`)).toBe(true);
    expect(verify(`${h}.${p}x`)).toBe(false);
  });

  it('does not verify with a different issuer key', async () => {
    const other = await generateIssuerKeys();
    const [h, p, s] = jwt.split('.');
    const ok = createVerify('RSA-SHA256')
      .update(`${h}.${p}`)
      .verify(issuerPublicKeyFromJwk(other.publicJwk), Buffer.from(s ?? '', 'base64url'));
    expect(ok).toBe(false);
  });

  it('works with an encrypted key loaded via loadIssuerPrivateKey', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'univault-sd-'));
    try {
      const passphrase = 'test-only-passphrase-123';
      const keys = await generateIssuerKeys({ passphrase });
      await saveIssuerKeyPair(dir, keys);
      const privateKey = await loadIssuerPrivateKey(dir, keys.kid, passphrase);
      const token = await createSdJwt(claims, disclosable, { kid: keys.kid, privateKey });
      expect((await decodeSdJwt(token)).header.kid).toBe(keys.kid);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('is accepted by the @sd-jwt/core verifier (interoperability)', async () => {
    const publicKey = issuerPublicKeyFromJwk(issuerKeys.publicJwk);
    const verifier = new SdJwtInstance({
      hasher: sha256Hasher,
      hashAlg: 'sha-256',
      verifier: (data: string, sig: string) =>
        createVerify('RSA-SHA256').update(data).verify(publicKey, Buffer.from(sig, 'base64url')),
    });
    const { payload } = await verifier.verify(sdJwt, {
      allowedIssuerAlgorithms: ['RS256'],
      currentDate: now + 60,
    });
    expect(payload.full_name).toBe('Lahiru Silva');
  });
});

describe('decodeSdJwt – inspection', () => {
  it('returns header, signed payload, disclosures and the full claim set', async () => {
    const decoded = await decodeSdJwt(sdJwt);
    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.payload._sd).toHaveLength(disclosable.length);
    expect(decoded.claims).toEqual(claims);
    expect(decoded.undisclosedDigests).toEqual([]);
    const fullName = decoded.disclosures.find((d) => d.name === 'full_name');
    expect(fullName).toMatchObject({
      value: 'Lahiru Silva',
      digest: sha256B64url(fullName?.encoded ?? ''),
    });
  });

  it('reports digests of claims that were not revealed (as in a presentation)', async () => {
    const onlyTwo = [jwt, disclosures[0], disclosures[1], ''].join('~');
    const decoded = await decodeSdJwt(onlyTwo);
    expect(decoded.disclosures).toHaveLength(2);
    expect(decoded.undisclosedDigests).toHaveLength(disclosable.length - 2);
  });
});

describe('createSdJwt – input validation', () => {
  it('rejects a disclosable field that is not in the claims', async () => {
    await expect(createSdJwt(claims, ['nic_number'], signingKey)).rejects.toThrow(/not present/);
  });

  it.each(['iss', 'exp', 'cnf', 'vct', 'status', 'jti', 'issuer_name'])(
    'rejects making envelope claim "%s" disclosable',
    async (field) => {
      await expect(createSdJwt(claims, [field], signingKey)).rejects.toThrow(/envelope claim/);
    },
  );

  it('rejects duplicate disclosable fields', async () => {
    await expect(createSdJwt(claims, ['full_name', 'full_name'], signingKey)).rejects.toThrow(
      /Duplicate/,
    );
  });

  it('requires the iss claim', async () => {
    const noIss = { ...claims, iss: '' };
    await expect(createSdJwt(noIss, [], signingKey)).rejects.toThrow(/iss/);
  });

  it('rejects a non-RSA or public key', async () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    await expect(createSdJwt(claims, [], { kid: 'x', privateKey: ec.privateKey })).rejects.toThrow(
      /RSA private key/,
    );
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await expect(createSdJwt(claims, [], { kid: 'x', privateKey: rsa.publicKey })).rejects.toThrow(
      /RSA private key/,
    );
  });

  it('rejects reserved SD-JWT claim names in the input', async () => {
    await expect(createSdJwt({ ...claims, _sd: ['x'] }, [], signingKey)).rejects.toThrow();
  });
});
