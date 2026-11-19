import { sha256 } from '@noble/hashes/sha2.js';
import { SD_HASH_ALG } from './constants.js';

const textEncoder = new TextEncoder();

/**
 * SHA-256 hasher in the shape `@sd-jwt/core` expects. Pure JavaScript, so it
 * runs on both Node.js and React Native (Hermes).
 */
export function sha256Hasher(data: string | ArrayBuffer, alg: string = SD_HASH_ALG): Uint8Array {
  if (alg !== SD_HASH_ALG) throw new Error(`Unsupported hash algorithm: ${alg}`);
  return sha256(typeof data === 'string' ? textEncoder.encode(data) : new Uint8Array(data));
}
