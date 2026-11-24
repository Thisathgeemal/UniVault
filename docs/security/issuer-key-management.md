# Issuer Key Management

**Sprint:** S2 (Sprint 1 carry-over) · **Component:** backend (`src/keys/key-store.ts`,
`src/keys/startup-check.ts`)
**Requirements:** NFR-01, FR-ISS-02, NFR-08 · **Decision:** [014](../dev-log/decisions.md#decision-014-encrypted-key-file-or-encrypted-env-bundle-decrypted-once-in-a-central-key-store-kmshsm-as-future-work)
**Tests:** `backend/test/key-store.test.ts`, `backend/test/key-startup.test.ts`,
`backend/test/check-secrets.test.ts` · **Evidence:** `scripts/evidence/s1-keys.ps1`

## 1. What we protect, and against whom

Each issuer (employer, bank) signs credentials with its own **RS256 private key**. Whoever has
that key can issue credentials the whole ecosystem will trust, so it is the most valuable
secret in UniVault.

| Threat                                                         | Protection                                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key committed to Git (public repository, forks, history)       | `.gitignore` (`keys/`, `*.pem`, `*.key`, `*.bundle.b64`, `.env`); `npm run check:secrets` scans tracked **and staged** files by name and content |
| Key copied from disk, a backup or the host's secret store      | Stored **encrypted only** (PKCS#8, AES-256-CBC); useless without `ISSUER_KEY_PASSPHRASE`. Unencrypted keys are refused                           |
| Key or passphrase leaked through logs, errors or API responses | One owner (the key store); errors carry code, issuer id and kid only; logger redaction; public-only JWKS                                         |
| Wrong or swapped key used for signing                          | Start-up check: RFC 7638 thumbprint must equal the stored `kid`, and the derived public key must equal the stored JWK                            |
| Weak or published passphrase in production                     | Production refuses passphrases under 20 characters and the development value from `.env.example`                                                 |
| Server compromise while running                                | **Not fully covered:** the decrypted key is in process memory. A cloud KMS or HSM is the answer (section 9)                                      |

Attackers in scope: someone with read access to the repository, a log aggregator, a backup or
the hosting dashboard. Out of scope for the prototype: an attacker who controls the running
server process.

## 2. Single owner of private keys

**Rule: only `backend/src/keys/key-store.ts` touches private keys.** It is the only code that
reads key files, `ISSUER_KEYS_BUNDLE` or `ISSUER_KEY_PASSPHRASE`.

| Caller                                                 | Uses                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| Signing (`credentials.service.ts`)                     | `getSigningKey(issuerId)` → `{ kid, privateKey: KeyObject }` |
| Key generation and rotation (`issuer-keys.service.ts`) | `createKeyPair()`, then `reload(issuerId)`                   |
| Start-up check (`server.ts`)                           | `init()` through `checkIssuerKeysAtStartup()`                |
| `GET /health`                                          | `status()` → counts only                                     |
| `npm run keys:bundle`                                  | `writeBundle(path)`                                          |

Routes never touch keys. A test (`key-store.test.ts`, "single owner of private keys") fails if
any other source file loads, decrypts, generates or saves a private key.

## 3. Key lifecycle

1. **Generate:** `npm run keys:init` (every issuer without an active key) or
   `POST /api/v1/issuers/:issuerId/keys` (admin, rotation). RSA 2048, `kid` = RFC 7638
   thumbprint.
2. **Store encrypted:** `<kid>.private.pem` (encrypted PKCS#8, mode 0600) in
   `ISSUER_KEYS_DIR`; the public JWK goes into `issuer_keys` (`status = active`). Never
   unencrypted, never in the database.
3. **Load:** at start-up, every active key is read, checked to be encrypted PKCS#8, decrypted
   with `ISSUER_KEY_PASSPHRASE` and verified (section 5).
4. **Cache:** the `KeyObject` stays in a private `Map` inside the key store. Each key is
   decrypted **once** (concurrent first uses share one decryption). It is passed to the signer
   only; it is never serialised, logged or returned. A **failed** load is cached too, for
   `KEY_RETRY_BACKOFF_SECONDS` (section 6).
5. **Rotate:** a new key is generated and published; in the same database transaction the old
   one becomes `retired`. The key store then clears the issuer's cache entry and loads (and
   checks) the new key.
6. **Retire:** retired public keys stay in the JWKS so older credentials still verify. Their
   private keys are no longer loaded or used.

## 4. Key sources (`ISSUER_KEY_SOURCE`)

| Source           | Where the encrypted keys come from                                                        | Rotation through the API                           |
| ---------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `file` (default) | `<kid>.private.pem` files in `ISSUER_KEYS_DIR`                                            | Yes (`POST /issuers/:issuerId/keys`)               |
| `env`            | `ISSUER_KEYS_BUNDLE` = base64 of JSON `[{ "issuerId", "kid", "encryptedPrivateKeyPem" }]` | **No:** `409 KEY_ROTATION_UNSUPPORTED_IN_ENV_MODE` |

- **Both modes refuse any key that is not an encrypted PKCS#8 private key**
  (`KEY_UNENCRYPTED`), including unencrypted PKCS#8 and PKCS#1 (`BEGIN RSA PRIVATE KEY`).
- The passphrase **always** comes from `ISSUER_KEY_PASSPHRASE`, never from the bundle.
- The bundle is validated with zod (base64, JSON, issuer id and kid formats, no duplicates).
  Anything malformed is `KEY_SOURCE_INVALID`.
- `env` mode exists for hosts with an **ephemeral filesystem** (the final demo deployment),
  where key files written at runtime would vanish on restart. The bundle contains only
  encrypted keys, but it is still treated as a secret.

## 5. Start-up check

`server.ts`, after migrations and before listening. For every issuer with an active key in the
database:

1. Load the key from the source and refuse it if it isn't encrypted PKCS#8.
2. Decrypt it once.
3. Derive the public JWK and require its RFC 7638 thumbprint to equal the stored `kid`
   (`KEY_KID_MISMATCH`).
4. Require the derived public key to equal the stored public JWK (`KEY_PUBLIC_MISMATCH`).

| Policy                                                                        | On a failure                                                                                                                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Strict:** always in production; `ISSUER_KEYS_STRICT_STARTUP=true` elsewhere | One `error` line per failed issuer (issuer id, kid, code), a `fatal` summary, **exit 1 before listening**                                             |
| Not strict (development/test default)                                         | One `warn` line per failure; the server starts **degraded**; signing for that issuer answers `503 ISSUER_KEY_UNAVAILABLE`; other issuers keep working |

The summary line is `issuer keys loaded: <loaded>/<active>`.

**File permissions (file mode, outside production):** a warning for each key file readable by
group or others (POSIX). On Windows, where POSIX modes don't apply, the check is skipped and
one debug line says so.

**Production configuration** (checked before the database connects):

- `ISSUER_KEY_PASSPHRASE` is required, has at least 20 characters, and is not the development
  value from `.env.example`;
- `env` mode requires `ISSUER_KEYS_BUNDLE`;
- `ISSUER_KEYS_STRICT_STARTUP=false` is refused.

## 6. Errors

| Code (`KeyStoreError`) | Meaning                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `KEY_NOT_FOUND`        | No key file or bundle entry for the active kid (or no active key) |
| `KEY_DECRYPT_FAILED`   | Wrong or missing `ISSUER_KEY_PASSPHRASE`                          |
| `KEY_UNENCRYPTED`      | The PEM is not an encrypted PKCS#8 private key: refused           |
| `KEY_KID_MISMATCH`     | The private key's thumbprint differs from the stored kid          |
| `KEY_PUBLIC_MISMATCH`  | The private key doesn't match the stored public JWK               |
| `KEY_SOURCE_INVALID`   | Malformed bundle, unreadable file, not an RSA key                 |

- A `KeyStoreError` message names the issuer id, the kid and the code only. It has no `cause`.
  The library's error text is dropped because it can contain paths.
- **API:** every `KeyStoreError` becomes `503 ISSUER_KEY_UNAVAILABLE`, "The issuer signing key
  is not available. Try again later." No code, issuer or kid reaches the client.
- **Log:** one `error` line, `{ keyStore: { code, issuerId, kid } }`.

**Retry backoff (`KEY_RETRY_BACKOFF_SECONDS`, default 30, 0–3600):** when a key fails to load
(any `KeyStoreError`, at start-up or at signing), the failure is remembered for that many
seconds. During the window, `getSigningKey()` throws the same `KeyStoreError` again **without
reading or decrypting** the key, so a burst of signings against a broken key costs one
decryption, not one per request. The first call after the window retries; if the key has been
fixed meanwhile (passphrase corrected, file restored) it loads and is cached as usual.
`reload()`, and therefore a rotation, clears the remembered failure at once. `0` retries on
every call. `/health` keeps reporting `degraded` until the key has loaded.

Other key responses: `409 KEY_ROTATION_UNSUPPORTED_IN_ENV_MODE` (rotation in env mode),
`503 KEY_PASSPHRASE_NOT_CONFIGURED` (key generation without a passphrase), and
`409 ISSUER_KEY_MISSING` (an issuer with no active key at all, unchanged).

## 7. Health

`GET /api/v1/health` includes a keys block:

```json
{ "status": "ok", "database": "up", "keys": { "status": "ok", "activeKeys": 3, "loaded": 3 } }
```

The keys block is `degraded` when an active key failed to load (or wasn't loaded after the
start-up check). The overall status is then `degraded` with HTTP **503**, as for a database
outage. It holds **counts only**: no issuer ids, kids, paths or error codes (those are in the
server log).

The active keys are listed in the database, so when the database is down (or not configured)
they can't be counted. The keys block is then `{ "status": "unknown" }`, with no counts:

```json
{ "status": "degraded", "database": "down", "keys": { "status": "unknown" } }
```

## 8. Cloud deployment (ephemeral filesystem)

1. **Generate locally** (file mode, the laptop): `npm run keys:init` with a strong
   `ISSUER_KEY_PASSPHRASE` (20+ characters, not the development value) and the **production**
   `DATABASE_URL`, so the public keys are published where the deployed backend reads them.
2. **Bundle:** `npm run keys:bundle` reads the active encrypted key files, checks each one like
   start-up does, and writes `keys/issuer-keys.bundle.b64` (mode 0600, git-ignored). It refuses
   to overwrite an existing file without `--force`. It prints issuer ids, kids and the output
   path only, never the bundle, and ends with a reminder to delete the local file once
   `ISSUER_KEYS_BUNDLE` is set on the host.
3. **Set host secrets:** `ISSUER_KEY_SOURCE=env`, `ISSUER_KEYS_BUNDLE=<file content>`,
   `ISSUER_KEY_PASSPHRASE=<passphrase>` in the host's secret settings. Never in the repository,
   a chat or a ticket.
4. **Deploy.** The start-up log shows `issuer keys loaded: n/n` (source `env`) and
   `/health` shows `keys.status = ok`. Any failure stops the deployment (strict in production).
5. **Rotate:** repeat steps 1–4 (`POST /issuers/:id/keys` answers 409 in env mode). Delete
   the local bundle file once the secret is set.

### Production key checklist

Tick every item before the first production deployment, and again after each rotation.

- [ ] **New production keys:** generate them with `npm run keys:init` against the production
      `DATABASE_URL`. **Never reuse development keys** (`backend/keys/`) or keys from any test or
      evidence run.
- [ ] **New strong passphrase:** at least 20 characters, randomly generated, used only for
      production. **Never the development value** from `.env.example` or the one in your local
      `backend/.env` (production refuses the former; the latter is on your laptop).
- [ ] **Bundle:** `npm run keys:bundle` (with `-- --force` after a rotation); it must list one
      `bundled <issuer> kid <kid>` line per issuer.
- [ ] **Host secrets:** set `ISSUER_KEYS_BUNDLE` (the bundle file's content) and
      `ISSUER_KEY_PASSPHRASE` as **secrets** in the host's settings, plus
      `ISSUER_KEY_SOURCE=env`. Not in the repository, a chat, a ticket or a screenshot.
- [ ] **Delete the local bundle:** remove `keys/issuer-keys.bundle.b64` once the secret is set.
- [ ] **Health:** `GET /api/v1/health` answers 200 with `keys.status = "ok"` and
      `loaded` = `activeKeys` (the start-up log shows `issuer keys loaded: n/n`).
- [ ] **JWKS kid:** for each issuer, the `kid` in `GET /api/v1/issuers/:issuerId/keys` with
      `status` active equals the kid that `keys:bundle` printed.

**To verify at deployment** (not testable on the development machine, see Sprint 1 Issue 12):

- [ ] **Strict start-up on real PostgreSQL:** with `NODE_ENV=production` and a
      `postgres://` database, a wrong `ISSUER_KEY_PASSPHRASE` (or a bundle missing an active
      key) makes the server exit 1 before listening. Locally this was only proven with
      `ISSUER_KEYS_STRICT_STARTUP=true` on the embedded database.
- [ ] **File-permission warning on real Linux** (file mode only): a key file with mode 0644
      logs the "readable by group or others" warning at start-up outside production, and 0600
      does not. On Windows this check is skipped; it was tested only with a simulated platform.

## 9. What never appears in logs or API responses

- private keys, decrypted or encrypted PEM text (`PRIVATE KEY`), the bundle;
- `ISSUER_KEY_PASSPHRASE`, `JWT_SECRET`, the configuration object;
- key file paths and the keys folder;
- private JWK members (`d`, `p`, `q`, `dp`, `dq`, `qi`): the JWKS publishes `kty`, `n`, `e`,
  `kid`, `alg` and `use` only, even if a stored JWK ever contained more.

**How this is enforced:**

- pino redaction (`passphrase`, `privateKey`, `privateKeyPem`, `encryptedPrivateKeyPem`,
  `ISSUER_KEY_PASSPHRASE`, `ISSUER_KEYS_BUNDLE`, `JWT_SECRET`, `bundle`, `config`, …);
- the key store's error design;
- leak tests that scan every log line, error body and process output for key text, the
  passphrase, the bundle and the keys path;
- the evidence script's final leak check.

## 10. Future work: KMS or HSM

In the prototype the decrypted key lives in the backend's memory. The production path is a
**cloud KMS** (e.g. AWS KMS, Google Cloud KMS, Azure Key Vault) or an **HSM**, where the private
key is generated inside the module and **never leaves it**: the backend sends a digest and gets
a signature back.

The key store is the seam for this. `getSigningKey()` would become `sign(issuerId, data)`, and
only `key-store.ts` and the signer would change. Rotation would also move into the KMS, and the
passphrase would disappear.

This was not done now because it needs a cloud account, per-request network calls and a signing
interface that `@sd-jwt/core` would have to accept (Decision 014).
