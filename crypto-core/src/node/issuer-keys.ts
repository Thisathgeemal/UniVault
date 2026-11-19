/**
 * Issuer signing keys (RS256) – Node.js only.
 *
 * Each issuer (employer or bank) signs credentials with its own RSA key pair.
 * - The public key is published as a JWK so verifiers can check signatures
 *   (FR-ISS-02, FR-VER-02, NFR-01).
 * - The key ID (`kid`) is the RFC 7638 JWK thumbprint of the public key, so it
 *   is unique, deterministic and cannot be mixed up with another key.
 * - Private keys are exported as PKCS#8 PEM, encrypted with AES-256 whenever a
 *   passphrase is given, and are only ever written to disk encrypted.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPair,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const generateKeyPairAsync = promisify(generateKeyPair);

export const ISSUER_KEY_ALG = 'RS256' as const;
export const MIN_MODULUS_LENGTH = 2048;
const ENCRYPTED_PEM_HEADER = '-----BEGIN ENCRYPTED PRIVATE KEY-----';

/** RSA public key in JWK form, as published to verifiers. */
export interface IssuerPublicJwk {
  kty: 'RSA';
  n: string;
  e: string;
  kid: string;
  alg: typeof ISSUER_KEY_ALG;
  use: 'sig';
}

export interface IssuerKeyPair {
  /** RFC 7638 SHA-256 thumbprint of the public key (base64url). */
  kid: string;
  alg: typeof ISSUER_KEY_ALG;
  publicJwk: IssuerPublicJwk;
  /** PKCS#8 PEM. Encrypted ("ENCRYPTED PRIVATE KEY") when a passphrase was given. */
  privateKeyPem: string;
  privateKeyEncrypted: boolean;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface GenerateIssuerKeysOptions {
  /** RSA modulus size in bits. Default 2048; minimum 2048. */
  modulusLength?: number;
  /** Encrypts the private key PEM (AES-256-CBC). Required for saveIssuerKeyPair. */
  passphrase?: string;
}

/** JSON Web Key Set, as served at the issuer's public-key endpoint. */
export interface IssuerJwks {
  keys: IssuerPublicJwk[];
}

/**
 * RFC 7638 JWK thumbprint (SHA-256, base64url) of an RSA public key.
 * Uses only the required members, in lexicographic order: e, kty, n.
 */
export function computeRsaJwkThumbprint(jwk: { e: string; kty: string; n: string }): string {
  if (jwk.kty !== 'RSA') throw new Error(`Expected an RSA JWK, got kty "${jwk.kty}"`);
  const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

function validatePassphrase(passphrase: string | undefined): void {
  if (passphrase !== undefined && passphrase.length < 12) {
    throw new Error('Passphrase must be at least 12 characters long');
  }
}

/**
 * Generates a new RS256 issuer key pair.
 *
 * @example
 *   const keys = await generateIssuerKeys({ passphrase: process.env.ISSUER_KEY_PASSPHRASE });
 *   keys.publicJwk   // publish via GET /issuers/:id/keys
 *   keys.privateKeyPem // store with saveIssuerKeyPair – never commit, never log
 */
export async function generateIssuerKeys(
  options: GenerateIssuerKeysOptions = {},
): Promise<IssuerKeyPair> {
  const modulusLength = options.modulusLength ?? MIN_MODULUS_LENGTH;
  if (!Number.isInteger(modulusLength) || modulusLength < MIN_MODULUS_LENGTH) {
    throw new Error(`modulusLength must be an integer of at least ${MIN_MODULUS_LENGTH} bits`);
  }
  validatePassphrase(options.passphrase);

  const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
    modulusLength,
    publicExponent: 0x10001,
  });

  const exported = publicKey.export({ format: 'jwk' });
  if (exported.kty !== 'RSA' || typeof exported.n !== 'string' || typeof exported.e !== 'string') {
    throw new Error('Unexpected public key export format');
  }
  const kid = computeRsaJwkThumbprint({ e: exported.e, kty: exported.kty, n: exported.n });

  const privateKeyPem = privateKey.export(
    options.passphrase
      ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: options.passphrase }
      : { type: 'pkcs8', format: 'pem' },
  ) as string;

  return {
    kid,
    alg: ISSUER_KEY_ALG,
    publicJwk: { kty: 'RSA', n: exported.n, e: exported.e, kid, alg: ISSUER_KEY_ALG, use: 'sig' },
    privateKeyPem,
    privateKeyEncrypted: options.passphrase !== undefined,
    createdAt: new Date().toISOString(),
  };
}

/** Converts a published issuer JWK into a Node.js KeyObject for RS256 verification. */
export function issuerPublicKeyFromJwk(jwk: IssuerPublicJwk): KeyObject {
  const { kty, n, e } = jwk;
  const nodeJwk: JsonWebKey = { kty, n, e };
  return createPublicKey({ key: nodeJwk, format: 'jwk' });
}

/** Builds the JWKS document for an issuer (public keys only). */
export function toJwks(keyPairs: readonly Pick<IssuerKeyPair, 'publicJwk'>[]): IssuerJwks {
  return {
    keys: keyPairs.map(({ publicJwk }) => ({
      kty: publicJwk.kty,
      n: publicJwk.n,
      e: publicJwk.e,
      kid: publicJwk.kid,
      alg: publicJwk.alg,
      use: publicJwk.use,
    })),
  };
}

/** File names used inside the keys directory. */
export function issuerKeyFileNames(kid: string): { privateKey: string; publicJwk: string } {
  if (!/^[A-Za-z0-9_-]{43}$/.test(kid)) throw new Error('Invalid kid');
  return { privateKey: `${kid}.private.pem`, publicJwk: `${kid}.public.jwk.json` };
}

/**
 * Writes a key pair to `keysDir` (e.g. process.env.ISSUER_KEYS_DIR, which is
 * git-ignored). Refuses to write an unencrypted private key.
 * The private key file is created with owner-only permissions (0600) where the
 * operating system supports it (not enforced on Windows).
 */
export async function saveIssuerKeyPair(
  keysDir: string,
  keyPair: IssuerKeyPair,
): Promise<{ privateKeyPath: string; publicJwkPath: string }> {
  if (!keyPair.privateKeyEncrypted || !keyPair.privateKeyPem.startsWith(ENCRYPTED_PEM_HEADER)) {
    throw new Error('Refusing to save an unencrypted private key – generate it with a passphrase');
  }
  const names = issuerKeyFileNames(keyPair.kid);
  await mkdir(keysDir, { recursive: true, mode: 0o700 });
  const privateKeyPath = join(keysDir, names.privateKey);
  const publicJwkPath = join(keysDir, names.publicJwk);
  // 'wx' = fail if the file already exists, so a key is never overwritten
  await writeFile(privateKeyPath, keyPair.privateKeyPem, { mode: 0o600, flag: 'wx' });
  await writeFile(publicJwkPath, `${JSON.stringify(keyPair.publicJwk, null, 2)}\n`, { flag: 'wx' });
  return { privateKeyPath, publicJwkPath };
}

/** Loads and decrypts an issuer private key for signing. Throws on a wrong passphrase. */
export async function loadIssuerPrivateKey(
  keysDir: string,
  kid: string,
  passphrase: string,
): Promise<KeyObject> {
  const pem = await readFile(join(keysDir, issuerKeyFileNames(kid).privateKey), 'utf8');
  return createPrivateKey({ key: pem, format: 'pem', passphrase });
}

/** Loads a stored public JWK and checks that its kid still matches its thumbprint. */
export async function loadIssuerPublicJwk(keysDir: string, kid: string): Promise<IssuerPublicJwk> {
  const raw = await readFile(join(keysDir, issuerKeyFileNames(kid).publicJwk), 'utf8');
  const jwk = JSON.parse(raw) as IssuerPublicJwk;
  if (jwk.kid !== kid || computeRsaJwkThumbprint(jwk) !== kid) {
    throw new Error(`Public key file for ${kid} does not match its key ID`);
  }
  return jwk;
}
