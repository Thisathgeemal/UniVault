# @univault/crypto-core

Shared cryptography for UniVault. It wraps `@sd-jwt/core` (Decision 006) and
holds the key-management helpers used by the backend.

| Entry point                  | Runs on                         | Contents                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@univault/crypto-core`      | Node.js and React Native (Expo) | `decodeDisclosures`, `validateDisclosures`, `decodeDisclosure`, `disclosureDigest`, `decodeSdJwt`, `sha256Hasher`, `computeEcJwkThumbprint`, constants (`SD_HASH_ALG`, `SD_JWT_VC_TYP`, `SALT_BYTES`, `NON_DISCLOSABLE_CLAIMS`) |
| `@univault/crypto-core/node` | Node.js only                    | Everything above, plus issuer RS256 key generation, JWKS export, key storage (`generateIssuerKeys`, `saveIssuerKeyPair`, `loadIssuerPrivateKey`, `toJwks`, `computeRsaJwkThumbprint`, …), `createSdJwt`, `verifySdJwt`          |

Holder presentation and key-binding verification (`verifyPresentation`) are
planned for Sprint 3.

## Scripts

```
npm install
npm test          # vitest (158 tests)
npm run test:coverage # tests + coverage table (fails below the thresholds)
npm run test:report # tests + coverage, listing every test name
npm run test:watch # vitest in watch mode
npm run typecheck # tsc --noEmit
npm run build     # compile to dist/
npm run demo:issue # build, create a sample credential and print its contents
npm run demo:verify # build, verify a genuine and three tampered credentials
npm run demo:disclosures # build, decode disclosures and show tampering being rejected
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

## Verifying credentials (`verifySdJwt`)

```ts
import { verifySdJwt } from '@univault/crypto-core/node';

const result = await verifySdJwt(token, issuerPublicJwk); // JWK from GET /issuers/:id/keys
if (result.valid) use(result.claims);
else log(result.errors); // e.g. ['INVALID_SIGNATURE']
```

The function never throws for a bad token. It returns `valid`, plus one entry
per check, so the verifier portal can show a checklist:

| Check         | Fails with                                                                         | Catches                                       |
| ------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| `format`      | `MALFORMED_TOKEN`                                                                  | broken or truncated tokens                    |
| `algorithm`   | `UNSUPPORTED_ALGORITHM`                                                            | `alg: none` / HS256 substitution              |
| `key_id`      | `KEY_ID_MISMATCH`                                                                  | header `kid` not matching the issuer key      |
| `signature`   | `INVALID_SIGNATURE`                                                                | modified payload, wrong key, forged signature |
| `disclosures` | `DISCLOSURE_NOT_IN_SD`, `DUPLICATE_…`, `MALFORMED_…`, `UNSUPPORTED_HASH_ALGORITHM` | forged or edited disclosures                  |
| `expiry`      | `EXPIRED`                                                                          | `exp` passed (60 s clock skew allowed)        |
| `not_before`  | `NOT_YET_VALID`                                                                    | used before `nbf`                             |

- **`claims`** (visible + disclosed claims) is returned only when `valid` is
  true.
- **Presentations:** a token with a key-binding JWT attached is accepted, and
  `hasKeyBinding` is set. Key binding, nonce, audience, revocation status and
  request policy are checked by `verifyPresentation()` (Sprint 3).

## Decoding and checking disclosures (`decodeDisclosures`)

Runs on Node.js **and** the phone. It is the single place disclosures are
checked: `verifySdJwt` uses it too.

```ts
import { decodeDisclosures, validateDisclosures } from '@univault/crypto-core';

const r = decodeDisclosures(sdJwt); // reads _sd from the token's payload
r.disclosures; // [{ salt, name, value, digest, encoded }] – only those that passed
r.errors; // [{ index, code, message }] – one per rejected disclosure
r.undisclosedDigests; // claims the holder did not reveal
```

For each disclosure it does the following:

1. Base64URL-decodes it.
2. Checks that it is a `[salt, name, value]` array with a non-empty string salt
   and name.
3. Recalculates its SHA-256 digest and requires that digest to be in `_sd`.

It also rejects:

- **`DUPLICATE_DISCLOSURE`:** the same disclosure sent twice.
- **`DUPLICATE_CLAIM_NAME`:** two disclosures for one claim.
- **`CLAIM_NAME_CONFLICT`:** a disclosure that would overwrite a visible claim.
- **`RESERVED_CLAIM_NAME`:** reserved names (`_sd`, `...`, `_sd_alg`).
- **`UNSUPPORTED_HASH_ALGORITHM`:** any `_sd_alg` other than `sha-256`.
- **`MALFORMED_DISCLOSURE`:** anything that doesn't decode to the required array.
- **`DISCLOSURE_NOT_IN_SD`:** a tampered or forged disclosure whose digest isn't
  in `_sd`.

`decodeDisclosures` does **not** check the issuer signature. Without that check,
`_sd` itself could be fake, so use `verifySdJwt` whenever trust matters.

## Holder key thumbprints (`computeEcJwkThumbprint`)

Runs on Node.js **and** the phone (pure JavaScript, no `node:crypto`).

```ts
import { computeEcJwkThumbprint } from '@univault/crypto-core';

const thumbprint = computeEcJwkThumbprint({ kty: 'EC', crv: 'P-256', x, y });
// e.g. "cn-I_WNMClehiVp51i_0VpOENW1upEerA8sEam5hn-s" (43-character Base64URL)
```

- **What it is:** the RFC 7638 JWK thumbprint, i.e. SHA-256 over
  `{"crv","kty","x","y"}` in that order, Base64URL-encoded.
- **Where it is used:** the backend stores the thumbprint of the wallet key in
  a credential's `cnf.jwk` as `holder_key_thumbprint`. The wallet can compute
  the same value to identify its key.
- **Other members** (`kid`, `alg`, `use`, even `d`) are ignored. The function
  does not check that the key is public: callers that accept keys from outside,
  like the backend's `signCredential`, must reject `d` themselves.
- **Errors:** throws for a non-EC key, a missing `crv`, `x` or `y`, or
  coordinates that are not Base64URL.
- **RSA keys:** use `computeRsaJwkThumbprint` from `./node`. Issuer `kid`s are
  computed with it.
