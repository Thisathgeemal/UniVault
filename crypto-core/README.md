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
npm run demo:issue # build, create a sample credential and print its contents
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

## Creating credentials (`createSdJwt`)

```ts
import { createSdJwt, decodeSdJwt, loadIssuerPrivateKey } from '@univault/crypto-core/node';

const privateKey = await loadIssuerPrivateKey(keysDir, kid, passphrase);
const sdJwt = await createSdJwt(
  { iss, issuer_name, vct, schema_version, jti, iat, exp, cnf, status, ...subjectClaims },
  schema['x-univault'].selectivelyDisclosable, // fields to hide behind _sd digests
  { kid, privateKey },
);
const { header, payload, disclosures, claims } = await decodeSdJwt(sdJwt); // inspect
```

For each disclosable field, `@sd-jwt/core` (Decision 006) does the following:

1. Generates a random 128-bit salt.
2. Builds the disclosure `[salt, name, value]`.
3. Base64URL-encodes it.
4. Takes its SHA-256 digest and puts it in `_sd` (with `_sd_alg: "sha-256"`).

The JWT is then signed with **RS256**, with header `{ alg: "RS256", typ: "dc+sd-jwt", kid }`.

- **Output:** `<JWT>~<disclosure 1>~…~<disclosure n>~`
- **Rules enforced:** `iss` is required; every disclosable field must exist in the
  claims; there must be no duplicates; envelope claims (`iss`, `exp`, `nbf`, `cnf`,
  `vct`, `status`, `iat`, `jti`, `sub`, `issuer_name`, `schema_version`,
  `kyc_verification_date`) can never be disclosable; the key must be an RSA
  private key.
- **Object values** (e.g. `permanent_address`) are disclosed as one unit.
- **`decodeSdJwt`** does not verify the signature. It only decodes for display,
  debugging and tests. Verification belongs to the verifier.
