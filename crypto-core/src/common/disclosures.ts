/**
 * Disclosure decoding and digest validation – runs on Node.js and React Native.
 *
 * A disclosure is Base64URL(JSON([salt, claimName, claimValue])). It is only
 * trustworthy if its SHA-256 digest appears in the issuer-signed `_sd` array.
 * This module is the single place UniVault decodes and checks disclosures:
 * the verifier (verifySdJwt) and the wallet both use it.
 *
 * Note: this checks disclosures against a payload. It does NOT check the
 * issuer's signature on that payload – verifySdJwt() does both.
 */
import { base64urlDecode, uint8ArrayToBase64Url } from '@sd-jwt/core';
import { SD_HASH_ALG } from './constants.js';
import { sha256Hasher } from './hash.js';

export type DisclosureErrorCode =
  | 'MALFORMED_DISCLOSURE'
  | 'RESERVED_CLAIM_NAME'
  | 'DUPLICATE_DISCLOSURE'
  | 'DUPLICATE_CLAIM_NAME'
  | 'CLAIM_NAME_CONFLICT'
  | 'DISCLOSURE_NOT_IN_SD'
  | 'UNSUPPORTED_HASH_ALGORITHM';

export interface DecodedDisclosure {
  salt: string;
  name: string;
  value: unknown;
  /** Recalculated Base64URL SHA-256 digest of `encoded`. */
  digest: string;
  /** The disclosure exactly as received. */
  encoded: string;
}

export interface DisclosureError {
  /** Position of the disclosure in the input (-1 for errors about the whole set). */
  index: number;
  code: DisclosureErrorCode;
  message: string;
}

export interface DisclosureValidationResult {
  /** True only if every disclosure decoded and matched a digest in `_sd`. */
  valid: boolean;
  /** Disclosures that passed every check, in input order. */
  disclosures: DecodedDisclosure[];
  errors: DisclosureError[];
  /** `_sd` digests with no matching disclosure (claims not revealed). */
  undisclosedDigests: string[];
}

const B64URL = /^[A-Za-z0-9_-]+$/;
const RESERVED_NAMES = new Set(['_sd', '...', '_sd_alg']);

/** Recalculates the Base64URL SHA-256 digest of an encoded disclosure. */
export function disclosureDigest(encoded: string): string {
  return uint8ArrayToBase64Url(sha256Hasher(encoded, SD_HASH_ALG));
}

/** Decodes one disclosure. Throws with a reason if it is not [salt, name, value]. */
export function decodeDisclosure(encoded: string): DecodedDisclosure {
  if (typeof encoded !== 'string' || !B64URL.test(encoded)) {
    throw new Error('not a Base64URL string');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64urlDecode(encoded));
  } catch {
    throw new Error('not valid JSON after Base64URL decoding');
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error('expected a 3-element array [salt, name, value]');
  }
  const [salt, name, value] = parsed as [unknown, unknown, unknown];
  if (typeof salt !== 'string' || salt.length === 0)
    throw new Error('salt must be a non-empty string');
  if (typeof name !== 'string' || name.length === 0)
    throw new Error('claim name must be a non-empty string');
  return { salt, name, value, digest: disclosureDigest(encoded), encoded };
}

/**
 * Decodes disclosures and checks each one against the payload's `_sd` digests.
 *
 * Rejects (with a reason per disclosure):
 *   - anything that is not Base64URL JSON [salt, name, value]
 *   - reserved claim names (`_sd`, `...`, `_sd_alg`)
 *   - the same disclosure sent twice, or two disclosures for one claim name
 *   - a claim name that is already a visible claim in the payload
 *   - a disclosure whose recalculated digest is not in `_sd` (tampered or forged)
 */
export function validateDisclosures(
  encodedDisclosures: readonly string[],
  payload: Record<string, unknown>,
): DisclosureValidationResult {
  const sd = Array.isArray(payload._sd)
    ? payload._sd.filter((x): x is string => typeof x === 'string')
    : [];
  const errors: DisclosureError[] = [];
  const disclosures: DecodedDisclosure[] = [];

  if (encodedDisclosures.length > 0 && payload._sd_alg !== SD_HASH_ALG) {
    errors.push({
      index: -1,
      code: 'UNSUPPORTED_HASH_ALGORITHM',
      message: `_sd_alg must be "${SD_HASH_ALG}", got "${String(payload._sd_alg)}"`,
    });
    return { valid: false, disclosures, errors, undisclosedDigests: sd };
  }

  const seenDigests = new Set<string>();
  const seenNames = new Set<string>();
  encodedDisclosures.forEach((encoded, index) => {
    let d: DecodedDisclosure;
    try {
      d = decodeDisclosure(encoded);
    } catch (e) {
      errors.push({
        index,
        code: 'MALFORMED_DISCLOSURE',
        message: `Malformed disclosure: ${(e as Error).message}`,
      });
      return;
    }
    const fail = (code: DisclosureErrorCode, message: string) =>
      errors.push({ index, code, message });

    if (RESERVED_NAMES.has(d.name))
      return fail('RESERVED_CLAIM_NAME', `"${d.name}" cannot be a disclosed claim name`);
    if (seenDigests.has(d.digest))
      return fail('DUPLICATE_DISCLOSURE', `Disclosure for "${d.name}" appears more than once`);
    seenDigests.add(d.digest);
    if (!sd.includes(d.digest)) {
      return fail(
        'DISCLOSURE_NOT_IN_SD',
        `Disclosure for "${d.name}" is not signed by the issuer (digest not in _sd)`,
      );
    }
    if (seenNames.has(d.name))
      return fail('DUPLICATE_CLAIM_NAME', `More than one disclosure for "${d.name}"`);
    if (Object.hasOwn(payload, d.name)) {
      return fail('CLAIM_NAME_CONFLICT', `"${d.name}" is both a visible claim and a disclosure`);
    }
    seenNames.add(d.name);
    disclosures.push(d);
  });

  const matched = new Set(disclosures.map((d) => d.digest));
  return {
    valid: errors.length === 0,
    disclosures,
    errors,
    undisclosedDigests: sd.filter((digest) => !matched.has(digest)),
  };
}

/**
 * Convenience wrapper: takes a compact SD-JWT (credential or presentation),
 * reads `_sd` from its payload and validates its disclosures.
 * The issuer signature is NOT checked here – use verifySdJwt() for that.
 */
export function decodeDisclosures(sdJwt: string): DisclosureValidationResult {
  if (typeof sdJwt !== 'string') throw new TypeError('sdJwt must be a string');
  const parts = sdJwt.split('~');
  const payloadSegment = (parts[0] ?? '').split('.')[1];
  if (parts.length < 2 || !payloadSegment || !B64URL.test(payloadSegment)) {
    throw new Error('Not a compact SD-JWT (<JWT>~<disclosures>~)');
  }
  const payload: unknown = JSON.parse(base64urlDecode(payloadSegment));
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('SD-JWT payload is not a JSON object');
  }
  // Last part is '' (credential) or a KB-JWT (presentation) – neither is a disclosure
  return validateDisclosures(
    parts.slice(1, -1).filter(Boolean),
    payload as Record<string, unknown>,
  );
}
