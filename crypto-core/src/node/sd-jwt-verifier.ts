/**
 * SD-JWT credential verification (issuer signature + integrity) – Node.js only.
 *
 * verifySdJwt() answers: "Was this credential issued by this issuer, and has
 * anything been changed since?" (FR-VER-02, NFR-01). It runs every check and
 * reports each outcome separately, so the verifier portal can show a checklist.
 * It never throws for a bad token – it returns a result with `valid: false`.
 *
 * Holder key binding, nonce/audience, revocation status and request policy are
 * checked later by verifyPresentation() (Sprint 3), which builds on this.
 */
import { createHash, createVerify, type KeyObject } from 'node:crypto';
import { Disclosure, getClaims } from '@sd-jwt/core';
import { SD_HASH_ALG } from '../common/constants.js';
import { sha256Hasher } from '../common/hash.js';
import { ISSUER_KEY_ALG, issuerPublicKeyFromJwk, type IssuerPublicJwk } from './issuer-keys.js';

export type CheckName =
  'format' | 'algorithm' | 'key_id' | 'signature' | 'disclosures' | 'expiry' | 'not_before';

export type CheckStatus = 'pass' | 'fail' | 'skipped';

export type VerificationErrorCode =
  | 'MALFORMED_TOKEN'
  | 'UNSUPPORTED_ALGORITHM'
  | 'KEY_ID_MISMATCH'
  | 'INVALID_SIGNATURE'
  | 'UNSUPPORTED_HASH_ALGORITHM'
  | 'DISCLOSURE_NOT_IN_SD'
  | 'DUPLICATE_DISCLOSURE'
  | 'MALFORMED_DISCLOSURE'
  | 'EXPIRED'
  | 'NOT_YET_VALID';

export interface VerificationCheck {
  name: CheckName;
  status: CheckStatus;
  /** Short human-readable explanation (shown in the verifier portal). */
  detail: string;
  code?: VerificationErrorCode;
}

export interface SdJwtVerificationResult {
  /** True only if no check failed. */
  valid: boolean;
  checks: VerificationCheck[];
  /** Codes of the failed checks, for logs and anomaly detection. */
  errors: VerificationErrorCode[];
  header?: Record<string, unknown>;
  /** Signed payload (visible claims + `_sd`). Untrusted unless `valid`. */
  payload?: Record<string, unknown>;
  /** Visible + disclosed claims. Present only when `valid`. */
  claims?: Record<string, unknown>;
  disclosedClaimNames: string[];
  undisclosedCount: number;
  /** True if a key-binding JWT is attached (verified by verifyPresentation, not here). */
  hasKeyBinding: boolean;
}

export interface VerifySdJwtOptions {
  /** "Now" in seconds since epoch. Default: current time. */
  currentDate?: number;
  /** Allowed clock difference for exp / nbf, in seconds. Default 60. */
  clockSkewSeconds?: number;
  /** Set false to skip exp / nbf checks (e.g. inspecting an old credential). Default true. */
  checkTime?: boolean;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

function parseJsonSegment(segment: string): Record<string, unknown> {
  if (!B64URL.test(segment)) throw new Error('not Base64URL');
  const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('not a JSON object');
  }
  return value as Record<string, unknown>;
}

function digestOf(encodedDisclosure: string): string {
  return createHash('sha256').update(encodedDisclosure, 'ascii').digest('base64url');
}

function failResult(checks: VerificationCheck[], hasKeyBinding = false): SdJwtVerificationResult {
  return {
    valid: false,
    checks,
    errors: checks.flatMap((c) => (c.status === 'fail' && c.code ? [c.code] : [])),
    disclosedClaimNames: [],
    undisclosedCount: 0,
    hasKeyBinding,
  };
}

/**
 * Verifies an SD-JWT credential or presentation against the issuer's public key.
 *
 * @param token     compact SD-JWT: `<JWT>~<disclosure>~…~[<KB-JWT>]`
 * @param publicKey the issuer's published JWK (preferred – enables the kid check) or a KeyObject
 */
export async function verifySdJwt(
  token: string,
  publicKey: IssuerPublicJwk | KeyObject,
  options: VerifySdJwtOptions = {},
): Promise<SdJwtVerificationResult> {
  const checks: VerificationCheck[] = [];
  const add = (
    name: CheckName,
    status: CheckStatus,
    detail: string,
    code?: VerificationErrorCode,
  ) => checks.push(code ? { name, status, detail, code } : { name, status, detail });

  // 1. Format: split into issuer JWT, disclosures and optional KB-JWT; decode header/payload
  const parts = typeof token === 'string' ? token.split('~') : [];
  const jwt = parts[0] ?? '';
  const segments = jwt.split('.');
  const kbJwt = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  const hasKeyBinding = kbJwt !== '';
  const encodedDisclosures = parts.slice(1, parts.length - 1).filter((d) => d !== '');

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    if (parts.length < 2) throw new Error('missing "~" separator');
    if (segments.length !== 3 || !segments[2] || !B64URL.test(segments[2])) {
      throw new Error('issuer JWT must have three Base64URL parts');
    }
    header = parseJsonSegment(segments[0] ?? '');
    payload = parseJsonSegment(segments[1] ?? '');
  } catch (e) {
    add('format', 'fail', `Malformed SD-JWT: ${(e as Error).message}`, 'MALFORMED_TOKEN');
    return failResult(checks, hasKeyBinding);
  }
  add('format', 'pass', `Issuer JWT with ${encodedDisclosures.length} disclosure(s)`);

  // 2. Algorithm: only RS256 is accepted for issuer signatures (rejects "none", HS256, …)
  const algorithmOk = header.alg === ISSUER_KEY_ALG;
  if (algorithmOk) add('algorithm', 'pass', 'RS256');
  else
    add(
      'algorithm',
      'fail',
      `Issuer algorithm must be RS256, got "${String(header.alg)}"`,
      'UNSUPPORTED_ALGORITHM',
    );

  // 3. Key ID: header kid must match the JWK we verify with
  const jwk = 'kty' in publicKey ? publicKey : undefined;
  if (!jwk) add('key_id', 'skipped', 'Public key given as KeyObject – no kid to compare');
  else if (header.kid === jwk.kid) add('key_id', 'pass', 'Header kid matches issuer key');
  else
    add(
      'key_id',
      'fail',
      `Header kid "${String(header.kid)}" does not match issuer key "${jwk.kid}"`,
      'KEY_ID_MISMATCH',
    );

  // 4. Signature: RS256 over the exact "<header>.<payload>" bytes
  let signatureOk = false;
  if (algorithmOk) {
    try {
      const key = jwk ? issuerPublicKeyFromJwk(jwk) : (publicKey as KeyObject);
      signatureOk = createVerify('RSA-SHA256')
        .update(`${segments[0]}.${segments[1]}`)
        .verify(key, Buffer.from(segments[2] ?? '', 'base64url'));
    } catch {
      signatureOk = false;
    }
    if (signatureOk) add('signature', 'pass', 'RS256 signature valid for the issuer key');
    else
      add(
        'signature',
        'fail',
        'Signature does not match – credential modified or not signed by this issuer',
        'INVALID_SIGNATURE',
      );
  } else {
    add('signature', 'fail', 'Not verified: unsupported algorithm', 'INVALID_SIGNATURE');
  }

  // 5. Disclosures: each must be well formed, unique and referenced by a digest in _sd
  const sd = Array.isArray(payload._sd)
    ? payload._sd.filter((x): x is string => typeof x === 'string')
    : [];
  const disclosedNames: string[] = [];
  let disclosuresOk = true;
  let disclosureDetail = `${encodedDisclosures.length} disclosure(s) match _sd digests`;
  let disclosureCode: VerificationErrorCode | undefined;
  if (encodedDisclosures.length > 0 && payload._sd_alg !== SD_HASH_ALG) {
    disclosuresOk = false;
    disclosureCode = 'UNSUPPORTED_HASH_ALGORITHM';
    disclosureDetail = `_sd_alg must be "${SD_HASH_ALG}", got "${String(payload._sd_alg)}"`;
  } else {
    const seen = new Set<string>();
    for (const encoded of encodedDisclosures) {
      const digest = digestOf(encoded);
      let decoded: unknown;
      try {
        decoded = parseDisclosure(encoded);
      } catch {
        disclosuresOk = false;
        disclosureCode = 'MALFORMED_DISCLOSURE';
        disclosureDetail = 'A disclosure is not a valid [salt, name, value] array';
        break;
      }
      if (seen.has(digest)) {
        disclosuresOk = false;
        disclosureCode = 'DUPLICATE_DISCLOSURE';
        disclosureDetail = 'The same disclosure appears more than once';
        break;
      }
      seen.add(digest);
      if (!sd.includes(digest)) {
        disclosuresOk = false;
        disclosureCode = 'DISCLOSURE_NOT_IN_SD';
        disclosureDetail = `Disclosure for "${(decoded as [string, string])[1]}" is not signed by the issuer (digest not in _sd)`;
        break;
      }
      disclosedNames.push((decoded as [string, string])[1]);
    }
  }
  if (disclosuresOk) add('disclosures', 'pass', disclosureDetail);
  else add('disclosures', 'fail', disclosureDetail, disclosureCode);

  // 6–7. Validity period
  const checkTime = options.checkTime ?? true;
  const now = options.currentDate ?? Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSeconds ?? 60;
  if (!checkTime) {
    add('expiry', 'skipped', 'Time checks disabled');
    add('not_before', 'skipped', 'Time checks disabled');
  } else {
    if (typeof payload.exp !== 'number') add('expiry', 'skipped', 'No exp claim');
    else if (now - skew >= payload.exp)
      add('expiry', 'fail', `Expired at ${new Date(payload.exp * 1000).toISOString()}`, 'EXPIRED');
    else add('expiry', 'pass', `Valid until ${new Date(payload.exp * 1000).toISOString()}`);

    if (typeof payload.nbf !== 'number') add('not_before', 'skipped', 'No nbf claim');
    else if (now + skew < payload.nbf)
      add(
        'not_before',
        'fail',
        `Not valid before ${new Date(payload.nbf * 1000).toISOString()}`,
        'NOT_YET_VALID',
      );
    else add('not_before', 'pass', 'Already valid');
  }

  const valid = checks.every((c) => c.status !== 'fail');
  const result: SdJwtVerificationResult = {
    valid,
    checks,
    errors: checks.flatMap((c) => (c.status === 'fail' && c.code ? [c.code] : [])),
    header,
    payload,
    disclosedClaimNames: disclosedNames,
    undisclosedCount: Math.max(sd.length - disclosedNames.length, 0),
    hasKeyBinding,
  };
  if (valid) {
    const disclosures = encodedDisclosures.map((encoded) =>
      Disclosure.fromEncodeSync(encoded, { hasher: sha256Hasher, alg: SD_HASH_ALG }),
    );
    result.claims = await getClaims<Record<string, unknown>>(payload, disclosures, sha256Hasher);
  }
  return result;
}

function parseDisclosure(encoded: string): [string, string, unknown] {
  if (!B64URL.test(encoded)) throw new Error('not Base64URL');
  const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    typeof value[0] !== 'string' ||
    typeof value[1] !== 'string'
  ) {
    throw new Error('expected [salt, name, value]');
  }
  return value as [string, string, unknown];
}
