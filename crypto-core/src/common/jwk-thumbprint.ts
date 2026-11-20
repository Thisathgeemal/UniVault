/**
 * RFC 7638 JWK thumbprints for EC keys – runs on Node.js and React Native.
 *
 * The backend stores the thumbprint of the holder's wallet key (the key in a
 * credential's `cnf.jwk`) as `holder_key_thumbprint`; the wallet can compute
 * the same value to identify its key. Pure JavaScript (no node:crypto).
 */
import { uint8ArrayToBase64Url } from '@sd-jwt/core';
import { sha256Hasher } from './hash.js';

/** The members an EC public key's RFC 7638 thumbprint is computed from. */
export interface EcJwkThumbprintInput {
  crv: string;
  kty: string;
  x: string;
  y: string;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * RFC 7638 JWK thumbprint (SHA-256, base64url) of an EC public key.
 * Uses only the required members, in lexicographic order: crv, kty, x, y.
 * Any other members (kid, alg, use, d, …) are ignored.
 */
export function computeEcJwkThumbprint(jwk: EcJwkThumbprintInput): string {
  if (jwk === null || typeof jwk !== 'object') throw new TypeError('jwk must be an object');
  if (jwk.kty !== 'EC') throw new Error(`Expected an EC JWK, got kty "${String(jwk.kty)}"`);
  for (const member of ['crv', 'x', 'y'] as const) {
    const value: unknown = jwk[member];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`EC JWK member "${member}" is required`);
    }
    if (member !== 'crv' && !B64URL.test(value)) {
      throw new Error(`EC JWK member "${member}" must be Base64URL`);
    }
  }
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return uint8ArrayToBase64Url(sha256Hasher(canonical));
}
