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

| Script                  | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `npm run dev`           | Start with auto-restart on file changes (tsx)                               |
| `npm run build`         | Compile TypeScript to `dist/`                                               |
| `npm start`             | Run the compiled server (`dist/server.js`)                                  |
| `npm test`              | Unit, HTTP, database and server-process tests (Vitest; 247 tests, 11 files) |
| `npm run test:coverage` | Tests with a coverage report                                                |
| `npm run typecheck`     | Type-check without emitting files                                           |
| `npm run build:deps`    | Build `@univault/crypto-core` (`../crypto-core`)                            |
| `npm run db:migrate`    | Apply new SQL migrations                                                    |
| `npm run db:seed`       | Migrate, then load the synthetic issuers, staff and holders                 |
| `npm run db:inspect`    | Show tables, row counts and sample rows                                     |
| `npm run db:reset`      | Delete the embedded development database, then migrate and seed again       |
| `npm run keys:init`     | Generate a signing key for every issuer without an active one               |

`dev`, `build`, `typecheck`, `test`, `test:coverage` and `keys:init` run
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
  routes/credentials.routes.ts        credential issuance (pending), list, get; revoke/reissue planned
  routes/credential-offers.routes.ts  QR offers and wallet redemption (planned)
  routes/status.routes.ts             credential status (planned)
  routes/verifications.routes.ts      verification sessions (planned)
  services/issuer-keys.service.ts  key generation, rotation, JWKS publication
  services/holders.service.ts      holder records (schema-validated, issuer-scoped)
  services/credentials.service.ts  pending credentials, expiry rules, signCredential (SD-JWT)
  services/credential-schemas.ts   loads docs/schemas and validates claims
  db/schema.ts           Drizzle table definitions and relations
  db/client.ts           database connection (embedded PGlite or PostgreSQL server)
  db/migrate.ts          SQL migration runner
  db/seed.ts             loads seed-data/ (issuers, staff, holders)
  db/cli.ts              db:* and keys:init commands
migrations/              versioned SQL migrations (source of truth for the schema)
seed-data/               synthetic test data (scripts/generate-synthetic-data.mjs)
test/                    config, HTTP (supertest), database and server-process tests
```

**Middleware order:** request ID + logging → security headers (helmet) → CORS →
JSON body (size-limited) → `/api/v1` routes → 404 → error handler.

## API routes (`/api/v1`)

| Method | Path                                         | Access           | Status                               |
| ------ | -------------------------------------------- | ---------------- | ------------------------------------ |
| GET    | `/health`                                    | Public           | ✅ Implemented                       |
| POST   | `/auth/login`                                | Public           | ✅ Implemented (rate-limited)        |
| GET    | `/auth/me`                                   | Login            | ✅ Implemented                       |
| POST   | `/auth/logout`                               | Login            | ✅ Implemented                       |
| GET    | `/staff`                                     | Admin            | ✅ Implemented                       |
| GET    | `/issuers`                                   | Public           | ✅ Implemented                       |
| GET    | `/issuers/:issuerId/keys`                    | Public           | ✅ Implemented                       |
| POST   | `/issuers/:issuerId/keys`                    | Admin (own)      | ✅ Implemented                       |
| GET    | `/holders`, `/holders/:holderId`             | Login            | ✅ Implemented                       |
| POST   | `/holders`                                   | Login            | ✅ Implemented                       |
| POST   | `/credentials`                               | Officer or admin | ✅ Implemented (creates **pending**) |
| GET    | `/credentials`, `/credentials/:credentialId` | Login            | ✅ Implemented                       |
| POST   | `/credentials/:credentialId/revoke`          | Admin            | 501 – Sprint 1                       |
| POST   | `/credentials/:credentialId/reissue`         | Login            | 501 – Sprint 1                       |
| POST   | `/credential-offers`                         | Login            | 501 – Sprint 1                       |
| POST   | `/credential-offers/token`                   | Public (code)    | 501 – Sprint 2 (wallet)              |
| POST   | `/credential-offers/credential`              | Public (code)    | 501 – Sprint 2 (wallet)              |
| GET    | `/status/:credentialId`                      | Public           | 501 – Sprint 1                       |
| POST   | `/verifications`                             | Public           | 501 – Sprint 3                       |
| GET    | `/verifications/:verificationId/request`     | Public           | 501 – Sprint 3                       |
| POST   | `/verifications/:verificationId/response`    | Public           | 501 – Sprint 3                       |
| GET    | `/verifications/:verificationId/result`      | Public           | 501 – Sprint 3                       |

Credentials are **signed when the wallet redeems its offer** (Sprint 2), by
`signCredential()` in `services/credentials.service.ts`; `POST /credentials`
only creates the pending record. See `docs/api/credentials-api.md`.

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

**Production:** `JWT_SECRET`, `ISSUER_KEY_PASSPHRASE` and `DATABASE_URL` are
required.

**`.env.example`:** see `backend/.env.example` for every variable.

## CORS and logging

- **CORS:** only origins in `CORS_ORIGINS` (the two portals) may call the API
  from a browser. Requests with no `Origin` header (the mobile wallet,
  server-to-server) are allowed.
- **Request IDs:** every request gets an `X-Request-ID` header, which appears in
  the response, the logs and error bodies.
- **Logs:** coloured and readable in development, JSON in production.
- **Redaction:** authorisation headers, cookies, passphrases, private keys and
  tokens are redacted from logs.

## Database

PostgreSQL. In development and tests it runs **embedded** (PGlite), with
nothing to install:

- **Development:** `DATABASE_URL=pglite://./.data/univault`, kept in
  `backend/.data/`, which is git-ignored.
- **Tests:** an in-memory database.
- **Deployment:** set `DATABASE_URL=postgres://…` (e.g. Neon or Supabase).
  Production refuses the embedded database.

The server applies new migrations at start-up (`DB_AUTO_MIGRATE=true`), and
`/health` reports `"database": "up"`.

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
```

- **Private keys:** encrypted, stored in `keys/` (git-ignored).
- **Public keys:** published at `GET /api/v1/issuers/:issuerId/keys` as a JWK Set.
- **Rotation:** admins can rotate a key with `POST /api/v1/issuers/:issuerId/keys`.

The backend uses `@univault/crypto-core` (`file:../crypto-core`). `npm run dev`,
`npm test` and `npm run build` rebuild it automatically first.

See `docs/api/issuer-keys-api.md`.
