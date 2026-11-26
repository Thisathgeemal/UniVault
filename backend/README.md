# UniVault backend

Node.js + Express 5 REST API (TypeScript), serving the issuer portal, verifier
portal and mobile wallet.

## Run it

```
cd backend
npm install
copy .env.example .env      # Windows (macOS/Linux: cp .env.example .env)
npm run dev                 # http://localhost:4000/api/v1/health
```

| Script                  | Purpose                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Start with auto-restart on file changes (tsx)                                                                                                                                                       |
| `npm run build`         | Compile TypeScript to `dist/`                                                                                                                                                                       |
| `npm start`             | Run the compiled server (`dist/server.js`)                                                                                                                                                          |
| `npm test`              | Unit, HTTP, database and server-process tests (Vitest; 498 tests, 21 files). Two projects: `fast` (parallel), then `heavy` (one file at a time)                                                     |
| `npm run test:fast`     | Only the fast, in-process tests (parallel)                                                                                                                                                          |
| `npm run test:heavy`    | Only the heavy tests: real processes and on-disk PGlite (one file at a time)                                                                                                                        |
| `npm run test:coverage` | Tests with a coverage report; fails below 90 / 86 / 93 / 90 % (stmts / branches / funcs / lines)                                                                                                    |
| `npm run typecheck`     | Type-check without emitting files                                                                                                                                                                   |
| `npm run build:deps`    | Build `@univault/crypto-core` (`../crypto-core`)                                                                                                                                                    |
| `npm run db:migrate`    | Apply new SQL migrations                                                                                                                                                                            |
| `npm run db:seed`       | Migrate, then load the synthetic issuers, staff and holders                                                                                                                                         |
| `npm run db:inspect`    | Show tables, row counts and sample rows                                                                                                                                                             |
| `npm run db:reset`      | Delete the embedded development database, then migrate and seed again                                                                                                                               |
| `npm run db:seed:demo`  | **Development only.** Dashboard demo credentials of every status for Serendib Trading (needs `db:seed`, `keys:init`); skips if present, `-- --reset` removes only the demo rows; prints counts only |
| `npm run keys:init`     | Generate a signing key for every issuer without an active one                                                                                                                                       |
| `npm run keys:bundle`   | Write the active encrypted keys to `keys/issuer-keys.bundle.b64` for `ISSUER_KEYS_BUNDLE` (`--force` to replace; prints ids and kids only)                                                          |

`dev`, `build`, `typecheck`, `test`, `test:coverage`, `keys:init` and `db:seed:demo` run
`build:deps` first (npm `pre` scripts), so crypto-core is always up to date.

**Run the tests from PowerShell** (or cmd), not Git Bash: under Git Bash,
Vitest fails in every test file because of how the drive path is reported.

## Structure

```
src/
  server.ts              entry point: loads .env, validates config, starts, shuts down
  app.ts                 Express app factory (middleware order below)
  config/env.ts          environment variables → validated, typed config (zod)
  lib/logger.ts          pino logger with secret redaction
  lib/errors.ts          AppError + helpers (badRequest, notFound, notImplemented)
  lib/passwords.ts       scrypt password hashing
  middleware/validate.ts request validation (body / query / params) with zod
  middleware/error-handler.ts  404 handler + central error handler
  auth/tokens.ts         JWT access tokens (issue / verify)
  auth/auth-service.ts   staff login, account lockout
  auth/middleware.ts     requireAuth, requireRole, requireOwnIssuer
  routes/index.ts        mounts every router under /api/v1
  routes/schemas.ts      shared zod schemas for route parameters
  routes/health.routes.ts             GET /health
  routes/auth.routes.ts               login, me, logout (login rate limit)
  routes/staff.routes.ts              staff list (admin)
  routes/issuers.routes.ts            issuers, JWKS, key generation
  routes/holders.routes.ts            holder records
  routes/credentials.routes.ts        credential issuance (pending), list, get, revoke, reissue, events
  routes/dev.routes.ts                DEV ONLY (temporary): simulated redemption and expiry
  routes/credential-offers.routes.ts  QR offers and status; wallet redemption planned (Sprint 2)
  routes/dashboard.routes.ts          issuer dashboard summary (officer/admin, own issuer, no-store)
  routes/status.routes.ts             PUBLIC credential status (open CORS, rate limit, no-store)
  routes/verifications.routes.ts      verification sessions (planned)
  services/issuer-keys.service.ts  key generation, rotation, JWKS publication
  services/holders.service.ts      holder records (schema-validated, issuer-scoped)
  services/credentials.service.ts  pending credentials, expiry rules, signCredential (SD-JWT),
                                   revoke, reissue (supersede), status history
  services/credential-offers.service.ts  pre-authorised offers (hash only), status, findOfferByCode
  services/credential-schemas.ts   loads docs/schemas and validates claims
  services/credential-status.ts    effectiveStatus() + its SQL twin effectiveStatusCondition(), public lookup
  services/dashboard.service.ts    dashboard counts (one aggregate query) and recent activity
  db/schema.ts           Drizzle table definitions and relations
  db/client.ts           database connection (embedded PGlite or PostgreSQL server)
  db/migrate.ts          SQL migration runner
  db/seed.ts             loads seed-data/ (issuers, staff, holders)
  db/seed-demo.ts        DEV ONLY: dashboard demo credentials (db:seed:demo), --reset
  db/cli.ts              db:*, db:seed:demo, keys:init and keys:bundle commands
  keys/key-store.ts      the ONLY owner of private keys (file or env bundle, decrypt once)
  keys/startup-check.ts  start-up key check (strict in production)
migrations/              versioned SQL migrations (source of truth for the schema)
seed-data/               synthetic test data (scripts/generate-synthetic-data.mjs)
test/                    config, HTTP (supertest), database and server-process tests
```

**Middleware order:** request ID + logging → security headers (helmet) → CORS →
JSON body (size-limited) → `/api/v1` routes → 404 → error handler.

## API routes (`/api/v1`)

| Method | Path                                                 | Access           | Status                                                       |
| ------ | ---------------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| GET    | `/health`                                            | Public           | ✅ Implemented                                               |
| POST   | `/auth/login`                                        | Public           | ✅ Implemented (rate-limited)                                |
| GET    | `/auth/me`                                           | Login            | ✅ Implemented                                               |
| POST   | `/auth/logout`                                       | Login            | ✅ Implemented                                               |
| GET    | `/staff`                                             | Admin            | ✅ Implemented                                               |
| GET    | `/issuers`                                           | Public           | ✅ Implemented                                               |
| GET    | `/issuers/:issuerId/keys`                            | Public           | ✅ Implemented                                               |
| POST   | `/issuers/:issuerId/keys`                            | Admin (own)      | ✅ Implemented                                               |
| GET    | `/holders`, `/holders/:holderId`                     | Login            | ✅ Implemented                                               |
| POST   | `/holders`                                           | Login            | ✅ Implemented                                               |
| POST   | `/credentials`                                       | Officer or admin | ✅ Implemented (creates **pending**)                         |
| GET    | `/credentials`, `/credentials/:credentialId`         | Login            | ✅ Implemented                                               |
| POST   | `/credentials/:credentialId/revoke`                  | Admin            | ✅ Implemented (pending or valid)                            |
| POST   | `/credentials/:credentialId/reissue`                 | Officer or admin | ✅ Implemented (supersedes, new pending)                     |
| GET    | `/credentials/:credentialId/events`                  | Officer or admin | ✅ Implemented (status history)                              |
| POST   | `/credential-offers`                                 | Officer or admin | ✅ Implemented (one-time QR offer)                           |
| GET    | `/credential-offers/:offerId`                        | Login            | ✅ Implemented (status polling)                              |
| GET    | `/dashboard/summary`                                 | Officer or admin | ✅ Implemented (own issuer from the token, `no-store`)       |
| POST   | `/credential-offers/token`                           | Public (code)    | 501 – Sprint 2 (wallet)                                      |
| POST   | `/credential-offers/credential`                      | Public (code)    | 501 – Sprint 2 (wallet)                                      |
| GET    | `/status/:credentialId`                              | Public           | ✅ Implemented (any origin, rate limited, `no-store`)        |
| POST   | `/verifications`                                     | Public           | 501 – Sprint 3                                               |
| GET    | `/verifications/:verificationId/request`             | Public           | 501 – Sprint 3                                               |
| POST   | `/verifications/:verificationId/response`            | Public           | 501 – Sprint 3                                               |
| GET    | `/verifications/:verificationId/result`              | Public           | 501 – Sprint 3                                               |
| POST   | `/dev/credentials/:credentialId/simulate-redemption` | Admin (own)      | **Dev only**, mounted only if `DEV_SIMULATE_REDEMPTION=true` |
| POST   | `/dev/credentials/:credentialId/simulate-expiry`     | Admin (own)      | **Dev only**, same flag (temporary, removed in Sprint 2)     |

Credentials are **signed when the wallet redeems its offer** (Sprint 2), by
`signCredential()` in `services/credentials.service.ts`; `POST /credentials`
only creates the pending record. `POST /credential-offers` turns it into a one-time
QR offer. Revoke and reissue invalidate a credential's open offers, and every status
change is recorded in `credential_status_events` (Decision 012). Verifiers check a
credential with the public `GET /status/:credentialId` (Decision 013). See
`docs/api/credentials-api.md`, `docs/api/credential-offers-api.md` and
`docs/api/status-api.md`.

**Dashboard** (`GET /dashboard/summary`, `docs/api/dashboard-api.md`): counts for the token's
issuer from one aggregate query, with the same expiry rule as `effectiveStatus()`:

| Count            | Definition                                                  |
| ---------------- | ----------------------------------------------------------- |
| `issued`         | signed (`issued_at IS NOT NULL`)                            |
| `active`         | issued and effective status `valid` (`now < expires_at`)    |
| `revoked`        | issued and status `revoked`                                 |
| `superseded`     | issued and status `superseded`                              |
| `expired`        | issued and effective status `expired` (`expires_at <= now`) |
| `awaitingWallet` | status `pending`                                            |
| `expiringSoon`   | active and `expires_at < now + 30 days`                     |
| `holders`        | holder records of the issuer                                |

A credential revoked while pending is in none of the issued counts. Invariant:
`issued = active + revoked + superseded + expired`. Plus the last 10 status events (reason
codes and staff names only, never notes or claims).

**Demo data:** `npm run db:seed:demo` (development only) fills Serendib Trading with 8 active
(3 expiring within 30 days), 3 pending with open offers, 1 revoked after signing, 1 revoked
while pending, 1 superseded and 1 expired credential, through the real services. It is
idempotent; `-- --reset` removes only those rows (Decision 017).

Planned routes already validate their input. Each returns `501 NOT_IMPLEMENTED`
with the sprint it is planned for, until its handler is written.

## Error format

Every error, from validation to unknown routes to crashes, has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "path": "credentialType", "message": "Invalid option…", "code": "invalid_value" }
    ],
    "requestId": "39759dee-ef4e-4d46-b208-cf678bcdfcfd"
  }
}
```

**Codes:**

| Code                      | Status |
| ------------------------- | ------ |
| `VALIDATION_ERROR`        | 400    |
| `INVALID_JSON`            | 400    |
| `CORS_ORIGIN_NOT_ALLOWED` | 403    |
| `NOT_FOUND`               | 404    |
| `RATE_LIMITED`            | 429    |
| `PAYLOAD_TOO_LARGE`       | 413    |
| `NOT_IMPLEMENTED`         | 501    |
| `INTERNAL_ERROR`          | 500    |

Feature-specific codes (for example `HOLDER_NOT_FOUND`, `ACTIVE_CREDENTIAL_EXISTS`,
`ISSUER_KEY_MISSING`, `ACCOUNT_LOCKED`) are listed in each API document in `docs/api/`
and `docs/security/`.

In production, internal error messages and stack traces are never returned.
They are only logged.

## Configuration

**Where settings come from:** all settings are read from environment variables
(`backend/.env` locally) and validated at start-up by `src/config/env.ts`.

**Invalid values:** the server refuses to start and lists the problem variable
names, never their values.

**Production:** `JWT_SECRET`, `ISSUER_KEY_PASSPHRASE` (at least 20 characters, not
the development value from `.env.example`) and `DATABASE_URL` are required;
`ISSUER_KEY_SOURCE=env` also needs `ISSUER_KEYS_BUNDLE`.

**Issuer key settings:**

| Variable                     | Default                                | Meaning                                                                     |
| ---------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `ISSUER_KEYS_DIR`            | `./keys`                               | Encrypted key files (file mode), git-ignored                                |
| `ISSUER_KEY_PASSPHRASE`      | development value                      | Decrypts the keys (both modes)                                              |
| `ISSUER_KEY_SOURCE`          | `file`                                 | `file` or `env`                                                             |
| `ISSUER_KEYS_BUNDLE`         | –                                      | env mode: base64 bundle from `npm run keys:bundle` (host secret)            |
| `ISSUER_KEYS_STRICT_STARTUP` | `false` (`true` in production, forced) | Exit at start-up if any active key fails its check                          |
| `KEY_RETRY_BACKOFF_SECONDS`  | `30`                                   | Seconds a failed key load is remembered before signing retries (0 = always) |

**`.env.example`:** see `backend/.env.example` for every variable.

## CORS and logging

- **CORS:** only origins in `CORS_ORIGINS` (the two portals) may call the API
  from a browser. Requests with no `Origin` header (the mobile wallet,
  server-to-server) are allowed.
- **Request IDs:** every request gets an `X-Request-ID` header, which appears in
  the response, the logs and error bodies.
- **Logs:** coloured and readable in development, JSON in production.
- **Redaction:** authorisation headers, cookies, passphrases, private keys (also
  encrypted PEM and the key bundle), `JWT_SECRET`, the configuration object and
  tokens are redacted from logs.

## Database

PostgreSQL. In development and tests it runs **embedded** (PGlite), with
nothing to install:

- **Development:** `DATABASE_URL=pglite://./.data/univault`, kept in
  `backend/.data/`, which is git-ignored.
- **Tests:** an in-memory database.
- **Deployment:** set `DATABASE_URL=postgres://…` (e.g. Neon or Supabase).
  Production refuses the embedded database.

The server applies new migrations at start-up (`DB_AUTO_MIGRATE=true`), then
checks every active issuer key (`issuer keys loaded: n/n`). `/health` reports
`"database": "up"` and `"keys": { "status", "activeKeys", "loaded" }` (counts
only); either problem makes it `503 degraded`. Without a reachable database the
keys can't be counted and the block is `"keys": { "status": "unknown" }`.

See `docs/database/database-design.md` for the ER diagram and the rules each
table enforces.

## Authentication

Issuer staff log in with `POST /api/v1/auth/login` and send the returned
token as `Authorization: Bearer <token>`. The holder, credential, offer, staff
and key-management routes require login:

- **Officers:** can issue and reissue credentials.
- **Admins:** can also revoke credentials, manage keys and list staff.
- **Isolation:** staff can only act for their own issuer.

**Security measures:**

- account lockout after repeated failures
- a per-IP rate limit on login attempts
- the same error for every failed login, so accounts can't be discovered
- role and active status re-checked on every request

See `docs/security/issuer-staff-authentication.md`.

**Development logins** (after `npm run db:seed`): `admin@…` / `officer@…` for
each issuer, with password `UniVault-Dev-2026!` (or `SEED_STAFF_PASSWORD`).

## Issuer signing keys

```
npm run keys:init      # one key per issuer (needs ISSUER_KEY_PASSPHRASE in .env)
npm run keys:bundle    # encrypted active keys -> keys/issuer-keys.bundle.b64 (env mode)
```

- **Key store:** `src/keys/key-store.ts` is the **only** code that touches private
  keys. It decrypts each key once, checks its kid and public key, and caches the
  `KeyObject`. Any key problem gives `503 ISSUER_KEY_UNAVAILABLE`.
- **Private keys:** encrypted, stored in `keys/` (git-ignored) or deployed in
  `ISSUER_KEYS_BUNDLE`. Unencrypted keys are refused.
- **Public keys:** published at `GET /api/v1/issuers/:issuerId/keys` as a JWK Set.
- **Rotation:** admins can rotate a key with `POST /api/v1/issuers/:issuerId/keys`
  (file mode; `409 KEY_ROTATION_UNSUPPORTED_IN_ENV_MODE` in env mode).
- See `docs/security/issuer-key-management.md`.

The backend uses `@univault/crypto-core` (`file:../crypto-core`). `npm run dev`,
`npm test` and `npm run build` rebuild it automatically first.

See `docs/api/issuer-keys-api.md`.
