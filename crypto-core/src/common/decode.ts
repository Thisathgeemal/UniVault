/**
 * Decoding and inspection of SD-JWT credentials and presentations.
 *
 * Works on Node.js and React Native. Decoding does NOT verify the issuer
 * signature – use the verifier for that (FR-VER-02). It is for displaying a
 * credential in the wallet, debugging, tests and the dev log.
 */
import { decodeSdJwt as decodeWithLibrary, getClaims } from '@sd-jwt/core';
import { sha256Hasher } from './hash.js';

export interface InspectedDisclosure {
  /** Base64URL SHA-256 digest – the value that appears in `_sd`. */
  digest: string;
  salt: string;
  /** Claim name. */
  name: string;
  value: unknown;
  /** The Base64URL-encoded disclosure exactly as it appears after a `~`. */
  encoded: string;
}

export interface DecodedSdJwt {
  header: Record<string, unknown>;
  /** The signed JWT payload: visible claims plus `_sd` digests. */
  payload: Record<string, unknown>;
  signature: string;
  disclosures: InspectedDisclosure[];
  /** Visible claims merged with every disclosed claim (no `_sd`, `_sd_alg`). */
  claims: Record<string, unknown>;
  /** Digests in `_sd` with no matching disclosure (claims the holder did not reveal). */
  undisclosedDigests: string[];
  /** Present only on presentations with key binding. */
  keyBindingJwt?: { header: Record<string, unknown>; payload: Record<string, unknown> };
}

export async function decodeSdJwt(sdJwt: string): Promise<DecodedSdJwt> {
  const decoded = await decodeWithLibrary(sdJwt, sha256Hasher);
  const disclosures: InspectedDisclosure[] = decoded.disclosures.map((d) => {
    if (d.key === undefined) {
      throw new Error('Array-element disclosures are not used by UniVault credentials');
    }
    if (d._digest === undefined) throw new Error('Disclosure digest missing');
    return { digest: d._digest, salt: d.salt, name: d.key, value: d.value, encoded: d.encode() };
  });

  const claims = await getClaims<Record<string, unknown>>(
    decoded.jwt.payload,
    decoded.disclosures,
    sha256Hasher,
  );
  const sd = decoded.jwt.payload._sd;
  const disclosedDigests = new Set(disclosures.map((d) => d.digest));
  const undisclosedDigests = Array.isArray(sd)
    ? sd.filter((x): x is string => typeof x === 'string' && !disclosedDigests.has(x))
    : [];

  const result: DecodedSdJwt = {
    header: decoded.jwt.header,
    payload: decoded.jwt.payload,
    signature: decoded.jwt.signature,
    disclosures,
    claims,
    undisclosedDigests,
  };
  if (decoded.kbJwt) {
    result.keyBindingJwt = { header: decoded.kbJwt.header, payload: decoded.kbJwt.payload };
  }
  return result;
}
