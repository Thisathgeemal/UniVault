/**
 * Runtime setup for the crypto libraries on Hermes (React Native's JavaScript engine).
 * Imported FIRST by index.ts, before any crypto import (see the SD-JWT spike,
 * docs/spikes/sd-jwt/README.md §5, limitations L3–L5).
 *
 * What @univault/crypto-core (→ @sd-jwt/core, @owf/identity-common, @noble/hashes) needs:
 *
 * | Global                    | Hermes (Expo SDK 58)  | Here                                |
 * | ------------------------- | --------------------- | ----------------------------------- |
 * | crypto.getRandomValues    | missing               | polyfilled from expo-crypto (native) |
 * | TextEncoder / TextDecoder | built in              | checked (throws if missing)          |
 * | BigInt                    | built in              | checked (@noble/curves, ES256 later) |
 *
 * Base64: @sd-jwt/core and @owf/identity-common have their own base64url code (no atob, btoa
 * or Buffer; checked in node_modules on 27 Nov 2026), so no base64 polyfill is needed.
 * crypto.subtle (WebCrypto) is NOT provided and must not be relied on: hashing is pure JS
 * (@noble/hashes, via crypto-core's sha256Hasher).
 */
import { getRandomValues } from 'expo-crypto';

type RandomValues = <T extends ArrayBufferView | null>(array: T) => T;

interface CryptoGlobal {
  crypto?: { getRandomValues?: RandomValues };
}

/** Installs crypto.getRandomValues from expo-crypto when the engine has none. */
export function installGetRandomValues(target: CryptoGlobal = globalThis as CryptoGlobal): void {
  target.crypto ??= {};
  if (typeof target.crypto.getRandomValues !== 'function') {
    target.crypto.getRandomValues = ((array: ArrayBufferView | null) => {
      if (array === null) return array;
      // expo-crypto fills integer typed arrays (max 65 536 bytes, like the Web Crypto API)
      return getRandomValues(array as Uint8Array);
    }) as RandomValues;
  }
}

/** The globals the crypto libraries need, with whether this runtime has them. */
export function runtimeCapabilities(): Record<string, boolean> {
  const g = globalThis as Record<string, unknown> & CryptoGlobal;
  return {
    getRandomValues: typeof g.crypto?.getRandomValues === 'function',
    TextEncoder: typeof g.TextEncoder === 'function',
    TextDecoder: typeof g.TextDecoder === 'function',
    BigInt: typeof g.BigInt === 'function',
  };
}

/** Throws a clear error at start-up instead of an obscure one deep inside a library. */
export function assertCryptoRuntime(): void {
  const missing = Object.entries(runtimeCapabilities())
    .filter(([, available]) => !available)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`UniVault crypto setup: this JavaScript engine lacks ${missing.join(', ')}`);
  }
}

installGetRandomValues();
assertCryptoRuntime();
