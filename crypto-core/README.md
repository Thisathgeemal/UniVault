# @univault/crypto-core

Shared cryptography for UniVault. It wraps `@sd-jwt/core` (Decision 006) and
holds the key-management helpers used by the backend.

| Entry point                  | Runs on      | Contents                                              |
| ---------------------------- | ------------ | ----------------------------------------------------- |
| `@univault/crypto-core/node` | Node.js only | Issuer RS256 key generation, JWKS export, key storage |
| _(planned)_ universal entry  | Node + Expo  | SD-JWT issue / present / verify wrappers              |

## Scripts

```
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # compile to dist/
```

## Issuer keys (`./node`)

```ts
import {
  generateIssuerKeys,
  saveIssuerKeyPair,
  loadIssuerPrivateKey,
  toJwks,
} from '@univault/crypto-core/node';

const keys = await generateIssuerKeys({ passphrase: process.env.ISSUER_KEY_PASSPHRASE });
await saveIssuerKeyPair(process.env.ISSUER_KEYS_DIR!, keys); // encrypted PEM + public JWK
const jwks = toJwks([keys]); // serve at GET /issuers/:id/keys
const signingKey = await loadIssuerPrivateKey(dir, keys.kid, passphrase);
```

- **Algorithm:** RS256. RSA-2048 by default (3072 supported), public exponent 65537.
- **Key ID (`kid`):** the RFC 7638 SHA-256 JWK thumbprint of the public key. It is
  unique, deterministic, and checked again when a key is loaded.
- **Public key format:** JWK `{ kty, n, e, kid, alg: "RS256", use: "sig" }`,
  published as a JWKS. Private members (`d`, `p`, `q`, …) never appear.
- **Private key protection:**
  - Exported as PKCS#8 PEM, encrypted with AES-256-CBC when a passphrase is
    given (minimum 12 characters).
  - `saveIssuerKeyPair` refuses unencrypted keys and never overwrites a file.
    It sets permissions to 0600 where supported (not on Windows).
  - Keys are stored only in `ISSUER_KEYS_DIR`, which is git-ignored (`keys/`,
    `*.pem`).
  - The passphrase lives in the backend `.env` (`ISSUER_KEY_PASSPHRASE`) and is
    never committed or logged.
