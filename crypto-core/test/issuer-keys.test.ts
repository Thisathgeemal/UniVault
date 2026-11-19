import { createSign, createVerify } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeRsaJwkThumbprint,
  generateIssuerKeys,
  issuerKeyFileNames,
  issuerPublicKeyFromJwk,
  loadIssuerPrivateKey,
  loadIssuerPublicJwk,
  saveIssuerKeyPair,
  toJwks,
  type IssuerKeyPair,
} from '../src/node/index.js';

const PASSPHRASE = 'test-only-passphrase-123';
const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi'];

let keys: IssuerKeyPair;
let encryptedKeys: IssuerKeyPair;

beforeAll(async () => {
  [keys, encryptedKeys] = await Promise.all([
    generateIssuerKeys(),
    generateIssuerKeys({ passphrase: PASSPHRASE }),
  ]);
});

describe('computeRsaJwkThumbprint', () => {
  it('matches the RFC 7638 §3.1 test vector', () => {
    const rfcJwk = {
      kty: 'RSA',
      n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
      e: 'AQAB',
    };
    expect(computeRsaJwkThumbprint(rfcJwk)).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
  });

  it('rejects non-RSA keys', () => {
    expect(() => computeRsaJwkThumbprint({ kty: 'EC', e: 'x', n: 'y' })).toThrow(/RSA/);
  });
});

describe('generateIssuerKeys', () => {
  it('generates an RS256 key pair with a 2048-bit modulus and exponent 65537', () => {
    expect(keys.alg).toBe('RS256');
    expect(keys.publicJwk.kty).toBe('RSA');
    expect(keys.publicJwk.e).toBe('AQAB');
    expect(Buffer.from(keys.publicJwk.n, 'base64url').length * 8).toBe(2048);
  });

  it('exports the public key as a JWK with kid, alg and use', () => {
    expect(keys.publicJwk).toMatchObject({ alg: 'RS256', use: 'sig', kid: keys.kid });
    expect(issuerPublicKeyFromJwk(keys.publicJwk).asymmetricKeyType).toBe('rsa');
  });

  it('never includes private key material in the public JWK', () => {
    for (const member of PRIVATE_JWK_MEMBERS) expect(keys.publicJwk).not.toHaveProperty(member);
  });

  it('uses the RFC 7638 thumbprint of the public key as kid', () => {
    expect(keys.kid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(keys.kid).toBe(computeRsaJwkThumbprint(keys.publicJwk));
  });

  it('produces a unique kid for every key pair', () => {
    expect(keys.kid).not.toBe(encryptedKeys.kid);
  });

  it('exports the private key as unencrypted PKCS#8 PEM without a passphrase', () => {
    expect(keys.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(keys.privateKeyEncrypted).toBe(false);
  });

  it('encrypts the private key PEM when a passphrase is given', () => {
    expect(encryptedKeys.privateKeyPem).toMatch(/^-----BEGIN ENCRYPTED PRIVATE KEY-----/);
    expect(encryptedKeys.privateKeyEncrypted).toBe(true);
  });

  it('produces keys that sign and verify RS256 (RSA-SHA256)', () => {
    const data = 'header.payload';
    const signature = createSign('RSA-SHA256').update(data).sign(keys.privateKeyPem);
    const publicKey = issuerPublicKeyFromJwk(keys.publicJwk);
    expect(createVerify('RSA-SHA256').update(data).verify(publicKey, signature)).toBe(true);
    expect(createVerify('RSA-SHA256').update('tampered').verify(publicKey, signature)).toBe(false);
  });

  it('supports a larger modulus', async () => {
    const big = await generateIssuerKeys({ modulusLength: 3072 });
    expect(Buffer.from(big.publicJwk.n, 'base64url').length * 8).toBe(3072);
  });

  it('rejects a modulus smaller than 2048 bits', async () => {
    await expect(generateIssuerKeys({ modulusLength: 1024 })).rejects.toThrow(/at least 2048/);
  });

  it('rejects a short passphrase', async () => {
    await expect(generateIssuerKeys({ passphrase: 'short' })).rejects.toThrow(/at least 12/);
  });
});

describe('toJwks', () => {
  it('returns only public members for each key', () => {
    const jwks = toJwks([keys, encryptedKeys]);
    expect(jwks.keys).toHaveLength(2);
    expect(jwks.keys.map((k) => k.kid)).toEqual([keys.kid, encryptedKeys.kid]);
    const serialised = JSON.stringify(jwks);
    expect(serialised).not.toContain('PRIVATE KEY');
    for (const k of jwks.keys)
      expect(Object.keys(k).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use']);
  });
});

describe('saving and loading keys', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'univault-keys-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses to save an unencrypted private key', async () => {
    await expect(saveIssuerKeyPair(dir, keys)).rejects.toThrow(/unencrypted/);
  });

  it('saves an encrypted private key and the public JWK', async () => {
    const { privateKeyPath, publicJwkPath } = await saveIssuerKeyPair(dir, encryptedKeys);
    expect(await readFile(privateKeyPath, 'utf8')).toMatch(
      /^-----BEGIN ENCRYPTED PRIVATE KEY-----/,
    );
    expect(JSON.parse(await readFile(publicJwkPath, 'utf8'))).toEqual(encryptedKeys.publicJwk);
    if (process.platform !== 'win32') {
      expect((await stat(privateKeyPath)).mode & 0o777).toBe(0o600);
    }
  });

  it('never overwrites an existing key file', async () => {
    await expect(saveIssuerKeyPair(dir, encryptedKeys)).rejects.toThrow(/EEXIST|exists/);
  });

  it('loads the private key with the correct passphrase and signs', async () => {
    const privateKey = await loadIssuerPrivateKey(dir, encryptedKeys.kid, PASSPHRASE);
    const signature = createSign('RSA-SHA256').update('data').sign(privateKey);
    const publicKey = issuerPublicKeyFromJwk(encryptedKeys.publicJwk);
    expect(createVerify('RSA-SHA256').update('data').verify(publicKey, signature)).toBe(true);
  });

  it('fails to load the private key with a wrong passphrase', async () => {
    await expect(
      loadIssuerPrivateKey(dir, encryptedKeys.kid, 'wrong-passphrase-000'),
    ).rejects.toThrow();
  });

  it('loads the public JWK and checks it against its kid', async () => {
    expect(await loadIssuerPublicJwk(dir, encryptedKeys.kid)).toEqual(encryptedKeys.publicJwk);
  });

  it('rejects an invalid kid (path traversal guard)', () => {
    expect(() => issuerKeyFileNames('../../etc/passwd')).toThrow(/Invalid kid/);
  });
});
