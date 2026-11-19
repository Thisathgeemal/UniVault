/**
 * SD-JWT credential creation (issuer side) – Node.js only.
 *
 * Uses @sd-jwt/core (Decision 006), which performs the steps below; this module
 * supplies the cryptography and UniVault's rules:
 *   1. a random 128-bit salt per selectively disclosable claim
 *   2. a disclosure array [salt, claim name, claim value]
 *   3. Base64URL encoding of the disclosure JSON
 *   4. a SHA-256 digest of each encoded disclosure
 *   5. the digests placed in `_sd` (with `_sd_alg: "sha-256"`), claims removed
 *   6. an RS256 signature with the issuer's private key (FR-ISS-02, NFR-01)
 * Output: `<issuer-signed JWT>~<disclosure 1>~…~<disclosure n>~`
 */
import { createHash, createPrivateKey, createSign, randomBytes, type KeyObject } from 'node:crypto';
import { SdJwtInstance } from '@sd-jwt/core';
import {
  NON_DISCLOSABLE_CLAIMS,
  SALT_BYTES,
  SD_HASH_ALG,
  SD_JWT_VC_TYP,
} from '../common/constants.js';
import { ISSUER_KEY_ALG } from './issuer-keys.js';

/** The issuer key used for signing: its key ID and decrypted private key. */
export interface IssuerSigningKey {
  /** RFC 7638 thumbprint from generateIssuerKeys(); placed in the JWT header. */
  kid: string;
  /** From loadIssuerPrivateKey(), or an unencrypted PKCS#8 PEM (tests only). */
  privateKey: KeyObject | string;
}

export interface CreateSdJwtOptions {
  /** JOSE `typ` header. Default `dc+sd-jwt`. */
  typ?: string;
}

/** A claims object: visible envelope claims plus the subject claims. */
export type CredentialClaims = Record<string, unknown> & { iss: string };

function toPrivateKeyObject(key: KeyObject | string): KeyObject {
  const keyObject = typeof key === 'string' ? createPrivateKey(key) : key;
  if (keyObject.type !== 'private' || keyObject.asymmetricKeyType !== 'rsa') {
    throw new Error('Issuer signing key must be an RSA private key');
  }
  return keyObject;
}

function validateInput(claims: CredentialClaims, disclosableFields: readonly string[]): void {
  if (claims === null || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new Error('claims must be a plain object');
  }
  if (typeof claims.iss !== 'string' || claims.iss.length === 0) {
    throw new Error('claims.iss (issuer identifier) is required');
  }
  const seen = new Set<string>();
  for (const field of disclosableFields) {
    if (seen.has(field)) throw new Error(`Duplicate disclosable field: ${field}`);
    seen.add(field);
    if (!Object.hasOwn(claims, field)) {
      throw new Error(`Disclosable field "${field}" is not present in claims`);
    }
    if (NON_DISCLOSABLE_CLAIMS.includes(field)) {
      throw new Error(`"${field}" is an envelope claim and cannot be selectively disclosable`);
    }
  }
}

/** Node.js SHA-256 hasher (native) for issuance. */
function nodeSha256(data: string | ArrayBuffer, alg: string): Uint8Array {
  if (alg !== SD_HASH_ALG) throw new Error(`Unsupported hash algorithm: ${alg}`);
  const hash = createHash('sha256');
  hash.update(typeof data === 'string' ? data : new Uint8Array(data));
  return new Uint8Array(hash.digest());
}

/**
 * Creates an RS256-signed SD-JWT credential.
 *
 * @param claims            all claims; fields listed in `disclosableFields` become
 *                          selectively disclosable, the rest stay visible
 * @param disclosableFields top-level claim names to make selectively disclosable
 *                          (e.g. a schema's `x-univault.selectivelyDisclosable`)
 * @param issuerKey         the issuer's kid and private key
 * @returns compact SD-JWT: `<JWT>~<disclosure>~…~`
 */
export async function createSdJwt(
  claims: CredentialClaims,
  disclosableFields: readonly string[],
  issuerKey: IssuerSigningKey,
  options: CreateSdJwtOptions = {},
): Promise<string> {
  validateInput(claims, disclosableFields);
  const privateKey = toPrivateKeyObject(issuerKey.privateKey);

  const sdJwt = new SdJwtInstance({
    signer: (data: string) =>
      createSign('RSA-SHA256').update(data).sign(privateKey).toString('base64url'),
    signAlg: ISSUER_KEY_ALG,
    hasher: nodeSha256,
    hashAlg: SD_HASH_ALG,
    saltGenerator: (length: number) =>
      randomBytes(Math.max(length, SALT_BYTES)).toString('base64url'),
  });

  // Only the listed fields go into the disclosure frame; everything else stays visible
  const disclosureFrame = { _sd: [...disclosableFields] } as never;
  return sdJwt.issue({ ...claims }, disclosureFrame, {
    header: { typ: options.typ ?? SD_JWT_VC_TYP, kid: issuerKey.kid },
  });
}
