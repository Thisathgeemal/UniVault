/**
 * Wallet (holder) side of the SD-JWT flow – PURE JAVASCRIPT ONLY.
 *
 * This file deliberately imports nothing from Node.js (no node:crypto, no Buffer),
 * so the same code can run inside React Native / Expo. The two platform-specific
 * pieces are injected:
 *   - randomBytes(n): Expo → expo-crypto getRandomBytes; Node → crypto.getRandomValues
 *   - sha256(bytes):  @noble/hashes (pure JS) works everywhere; on Expo you may
 *                     swap in expo-crypto digest for speed.
 *
 * Holder key: ES256 (P-256) via @noble/curves – pure JS, fast on phones.
 */
import {
  SdJwtInstance,
  uint8ArrayToBase64Url,
  base64urlEncode,
  base64UrlToUint8Array,
} from '@sd-jwt/core';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

const textEncoder = new TextEncoder();

/** Hasher in the shape @sd-jwt/core expects. */
export const hasher = (data, alg) => {
  if (alg !== 'sha-256') throw new Error(`Unsupported hash alg ${alg}`);
  const bytes = typeof data === 'string' ? textEncoder.encode(data) : new Uint8Array(data);
  return sha256(bytes);
};

/** Create a holder key pair (P-256) and its public JWK. */
export function createHolderKey(randomBytes) {
  const secretKey = randomBytes(32);
  // noble rejects out-of-range scalars; retry is astronomically unlikely
  if (!p256.utils.isValidSecretKey(secretKey)) return createHolderKey(randomBytes);
  const publicKey = p256.getPublicKey(secretKey, false); // 0x04 || X || Y
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: uint8ArrayToBase64Url(publicKey.slice(1, 33)),
    y: uint8ArrayToBase64Url(publicKey.slice(33, 65)),
  };
  return { secretKey, jwk };
}

/** ES256 JWS signer for the key-binding JWT (raw r||s signature, as JOSE requires). */
export function es256Signer(secretKey) {
  return (data) => {
    const sig = p256.sign(textEncoder.encode(data), secretKey, {
      prehash: true,
      format: 'compact',
    });
    return uint8ArrayToBase64Url(sig);
  };
}

/** ES256 verification against a public JWK (used by the verifier for the KB-JWT). */
export function es256Verify(jwk, data, sigB64u) {
  const pub = new Uint8Array(65);
  pub[0] = 0x04;
  pub.set(base64UrlToUint8Array(jwk.x), 1);
  pub.set(base64UrlToUint8Array(jwk.y), 33);
  return p256.verify(base64UrlToUint8Array(sigB64u), textEncoder.encode(data), pub, {
    prehash: true,
    format: 'compact',
  });
}

/** Wallet instance: can decode, list claims and build presentations with key binding. */
export function createWalletSdJwt(holderSecretKey) {
  return new SdJwtInstance({
    hasher,
    hashAlg: 'sha-256',
    kbSigner: es256Signer(holderSecretKey),
    kbSignAlg: 'ES256',
  });
}

/**
 * Build a presentation that reveals only `claimNames`, bound to the verifier's
 * nonce and audience (replay protection).
 */
export async function buildPresentation(wallet, credential, claimNames, { nonce, aud }) {
  const frame = Object.fromEntries(claimNames.map((name) => [name, true]));
  return wallet.present(credential, frame, {
    kb: { payload: { iat: Math.floor(Date.now() / 1000), aud, nonce } },
  });
}

export { base64urlEncode, base64UrlToUint8Array };
