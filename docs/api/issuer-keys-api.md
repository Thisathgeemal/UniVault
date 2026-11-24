# Issuer Public Key API

**Sprint:** 1 · **Requirements:** FR-ISS-02, FR-VER-02, NFR-01, NFR-06
**Code:** `backend/src/routes/issuers.routes.ts`, `backend/src/services/issuer-keys.service.ts`;
private keys only through `backend/src/keys/key-store.ts`
([issuer-key-management.md](../security/issuer-key-management.md), Decision 014)
**Tests:** `backend/test/issuer-keys.test.ts`, `backend/test/key-store.test.ts`

## 1. Purpose

Every UniVault credential is signed by its issuer with an **RS256 private key**.
To check that signature, a verifier needs the issuer's **public key**. This API
publishes each issuer's public keys in the standard **JSON Web Key Set (JWKS)**
format (RFC 7517), so any verifier can fetch them without logging in.

## 2. Endpoints

| Method | Path                             | Access               | Purpose                                              |
| ------ | -------------------------------- | -------------------- | ---------------------------------------------------- |
| GET    | `/api/v1/issuers`                | Public               | List issuers and their key-set URLs                  |
| GET    | `/api/v1/issuers/:issuerId/keys` | Public               | The issuer's public keys (JWKS)                      |
| POST   | `/api/v1/issuers/:issuerId/keys` | Admin of that issuer | Generate a new signing key (rotates the current one) |

### GET `/api/v1/issuers/:issuerId/keys`

**Request:** `GET /api/v1/issuers/bank-a/keys` (no authentication).

**Response `200`:**

- **Headers:**
  - `Content-Type: application/jwk-set+json`
  - `Cache-Control: public, max-age=300`
- **Body:**

  ```json
  {
    "keys": [
      {
        "kty": "RSA",
        "kid": "gVGSDaD0A9DtxifHNIJw-es67uEYHDwj4L5ZUOQC2h8",
        "use": "sig",
        "alg": "RS256",
        "n": "sINim-lFnfNMa4HUqVzcRMykcfAZ-Cvg…",
        "e": "AQAB"
      }
    ]
  }
  ```

**Contents:**

- Only the six standard public members are returned. Private key material
  (`d`, `p`, `q`, …) is never stored in the database or returned.
- `kid` is the RFC 7638 thumbprint of the key. Each credential's header carries
  the `kid` of the key that signed it.
- The **active** key comes first, followed by **retired** keys, newest first.

**Errors:**

| Situation                                                    | Status | Code                    |
| ------------------------------------------------------------ | ------ | ----------------------- |
| Malformed ID (not 3–40 lowercase letters, digits or hyphens) | 400    | `VALIDATION_ERROR`      |
| Unknown issuer                                               | 404    | `ISSUER_NOT_FOUND`      |
| Issuer exists but has no key yet                             | 404    | `ISSUER_KEYS_NOT_FOUND` |

### GET `/api/v1/issuers`

```json
{
  "issuers": [
    {
      "id": "bank-a",
      "name": "UniVault Demo Bank",
      "type": "bank",
      "jwksUri": "http://localhost:4000/api/v1/issuers/bank-a/keys"
    }
  ]
}
```

### POST `/api/v1/issuers/:issuerId/keys` (admin)

**Requirements:** an admin login token for the same issuer.

**Response `201`:**

```json
{
  "issuerId": "employer-a",
  "kid": "…",
  "alg": "RS256",
  "createdAt": "2026-11-20T…",
  "retiredKid": null
}
```

**Errors:**

| Situation                                                     | Status                                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No login                                                      | 401                                                                                                                                                                                     |
| Malformed issuer ID                                           | 400 `VALIDATION_ERROR`                                                                                                                                                                  |
| An officer, or an admin of another issuer                     | 403 `FORBIDDEN`                                                                                                                                                                         |
| Keys come from `ISSUER_KEYS_BUNDLE` (`ISSUER_KEY_SOURCE=env`) | 409 `KEY_ROTATION_UNSUPPORTED_IN_ENV_MODE` (nothing is created). Generate the key locally with the CLI, run `npm run keys:bundle`, update `ISSUER_KEYS_BUNDLE` on the host and redeploy |
| `ISSUER_KEY_PASSPHRASE` not configured                        | 503 `KEY_PASSPHRASE_NOT_CONFIGURED` (nothing is written)                                                                                                                                |
| The new key cannot be loaded back after publishing            | 503 `ISSUER_KEY_UNAVAILABLE` (detail in the server log only)                                                                                                                            |

The response never contains private key material. The JWKS and every key response contain only
the public members `kty`, `n`, `e`, `kid`, `alg` and `use`. A test fails if `d`, `p`, `q`,
`dp`, `dq` or `qi` ever appear, even when a stored JWK is tampered with.

## 3. How a verifier uses it

1. Read `kid` from the credential's JWT header.
2. Fetch `GET /api/v1/issuers/<issuer>/keys` (cache it for up to 5 minutes).
3. Pick the key whose `kid` matches.
4. Verify the RS256 signature with it (`verifySdJwt` in `crypto-core`).

The test suites perform exactly these steps end to end: `issuer-keys.test.ts`
with a credential signed by the stored private key, and `credentials.test.ts`
with credentials signed by the issuance service.

## 4. Key generation and storage

| Part        | Where it goes                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private key | Encrypted (AES-256) with `ISSUER_KEY_PASSPHRASE`, saved as `<kid>.private.pem` in `ISSUER_KEYS_DIR` (git-ignored), or deployed in `ISSUER_KEYS_BUNDLE` (env mode). Read only by the key store, decrypted once and checked at start-up |
| Public key  | `issuer_keys` table (`status = active`) and `<kid>.public.jwk.json`                                                                                                                                                                   |

**Generating keys for all issuers at once:** run `npm run keys:init` from
`backend/`. It creates a key for every issuer that doesn't have an active one,
and is safe to repeat. For a host with an ephemeral filesystem, `npm run keys:bundle`
then writes the encrypted active keys as `keys/issuer-keys.bundle.b64` for
`ISSUER_KEYS_BUNDLE` (see the key-management doc, section 8).

## 5. Key rotation

Generating a new key for an issuer that already has one:

1. Marks the current key as `retired` and records `retired_at`.
2. Publishes the new key as `active`.

Both steps run in **one database transaction**, so there's never a moment with
zero or two active keys. Retired keys stay in the key set, so **credentials
signed before the rotation keep verifying**. New credentials are signed with the
new key: `signCredential()` always uses the issuer's **active** key (the key store
clears its cached entry and loads the new key right after the rotation), and
`backend/test/credentials.test.ts` checks that a credential signed after a
rotation carries the new `kid` and verifies, while an older one still verifies
with the retired key.

If the database step fails, the newly written key files are deleted, so no
unpublished private key is left on disk.

## 6. Design decisions

| Decision                               | Reason                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Return a JWK **Set**, not a single key | The standard verifier format; supports rotation and lookup by `kid`                                                |
| Public, no login                       | Verifiers and wallets are not issuer staff (MPR §1.7.2: trust through published public keys, no central authority) |
| 5-minute cache                         | Fewer requests from verifiers, while a rotation still spreads within minutes                                       |
| `application/jwk-set+json`             | The registered media type for JWK Sets (RFC 7517 §8.5)                                                             |
| Reuse `crypto-core`                    | Key generation, thumbprints and encrypted storage are the same tested code used everywhere                         |
